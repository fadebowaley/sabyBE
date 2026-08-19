const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Counter } = require('../models');
const projectFormService = require('./projectForm.service');

const SUPPORTED_INVOICE_CALCULATION_MODES = new Set([
  'none',
  'fixed',
  'line_items',
]);
const SUPPORTED_INVOICE_LINE_ITEM_TYPES = new Set(['fixed', 'percentage']);
const SUPPORTED_INVOICE_ADJUSTMENT_MODES = new Set(['none', 'fixed', 'percentage']);
const SUPPORTED_INVOICE_CONDITION_SOURCE_TYPES = new Set(['', 'field']);
const SUPPORTED_INVOICE_CONDITION_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
]);

const getExecutableFieldIds = (normalizedForm = {}) => {
  const ids = new Set();
  const elements = Array.isArray(normalizedForm?.elements) ? normalizedForm.elements : [];
  elements.forEach((element) => {
    [
      element?.id,
      element?.fieldKey,
      element?.key,
      element?.properties?.fieldKey,
      element?.properties?.name,
    ].forEach((value) => {
      const normalized = String(value || '').trim();
      if (normalized) ids.add(normalized);
    });
  });
  return ids;
};

const fieldExists = (fieldIds, fieldKey) => {
  const normalized = String(fieldKey || '').trim();
  return !normalized || fieldIds.size === 0 || fieldIds.has(normalized);
};

const normalizeToken = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const buildAnswerLookup = (submissionData = {}) => {
  const direct = submissionData && typeof submissionData === 'object' ? submissionData : {};
  const normalized = Object.entries(direct).reduce((acc, [key, value]) => {
    const token = normalizeToken(key);
    if (token && acc[token] === undefined) {
      acc[token] = value;
    }
    return acc;
  }, {});

  return {
    raw: direct,
    normalized,
  };
};

const resolveAnswerValue = (lookup, fieldKey) => {
  const rawKey = String(fieldKey || '').trim();
  if (!rawKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(lookup.raw, rawKey)) {
    return lookup.raw[rawKey];
  }
  return lookup.normalized[normalizeToken(rawKey)];
};

const coerceNumericValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const sanitized = value.replace(/,/g, '').trim();
    if (!sanitized) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const coercePositiveQuantity = (value) => {
  const numeric = coerceNumericValue(value);
  if (numeric == null) return 1;
  if (numeric <= 0) return 0;
  return numeric;
};

const compareConditionValue = (left, operator, right) => {
  const numericLeft = coerceNumericValue(left);
  const numericRight = coerceNumericValue(right);

  switch (operator) {
    case 'eq':
      return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
    case 'neq':
      return String(left ?? '').trim().toLowerCase() !== String(right ?? '').trim().toLowerCase();
    case 'gt':
      return numericLeft != null && numericRight != null ? numericLeft > numericRight : false;
    case 'gte':
      return numericLeft != null && numericRight != null ? numericLeft >= numericRight : false;
    case 'lt':
      return numericLeft != null && numericRight != null ? numericLeft < numericRight : false;
    case 'lte':
      return numericLeft != null && numericRight != null ? numericLeft <= numericRight : false;
    case 'contains':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').trim().toLowerCase());
    case 'in': {
      const expectedValues = Array.isArray(right)
        ? right
        : String(right || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
      return expectedValues
        .map((entry) => String(entry).toLowerCase())
        .includes(String(left ?? '').trim().toLowerCase());
    }
    default:
      return false;
  }
};

const evaluateConditions = (lookup, conditions = []) => {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => {
    const sourceType = String(condition?.sourceType || 'field').trim().toLowerCase();
    const operator = String(condition?.operator || 'eq').trim().toLowerCase();
    const fieldId = String(condition?.fieldId || '').trim();

    if (
      !SUPPORTED_INVOICE_CONDITION_SOURCE_TYPES.has(sourceType) ||
      !SUPPORTED_INVOICE_CONDITION_OPERATORS.has(operator) ||
      !fieldId
    ) {
      return false;
    }

    const actualValue = resolveAnswerValue(lookup, fieldId);
    return compareConditionValue(actualValue, operator, condition?.value);
  });
};

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;

const allocateInvoiceNumber = async ({
  tenantId,
  projectId,
  projectFormId,
  invoiceConfig,
}) => {
  const numberingMode = String(invoiceConfig?.invoiceNumbering?.mode || 'auto')
    .trim()
    .toLowerCase();

  if (numberingMode !== 'auto') {
    return {
      mode: numberingMode,
      sequence: null,
      prefix: String(invoiceConfig?.invoiceNumbering?.prefix || ''),
      value: null,
    };
  }

  const prefix = String(invoiceConfig?.invoiceNumbering?.prefix || '').trim();
  const configuredStart = Math.max(
    1,
    Number(invoiceConfig?.invoiceNumbering?.nextNumber || 1)
  );
  const counterName = [
    'invoice',
    String(tenantId || ''),
    String(projectId || ''),
    String(projectFormId || ''),
  ].join(':');

  await Counter.updateOne(
    { _id: counterName },
    {
      $setOnInsert: {
        _id: counterName,
        seq: configuredStart - 1,
      },
    },
    { upsert: true }
  );

  const counter = await Counter.findByIdAndUpdate(
    counterName,
    { $inc: { seq: 1 } },
    { new: true }
  );

  const sequence = Number(counter?.seq || configuredStart);
  const value = prefix ? `${prefix}${sequence}` : String(sequence);

  return {
    mode: 'auto',
    sequence,
    prefix,
    value,
  };
};

const evaluateLineItems = (invoiceConfig, lookup) => {
  const lineItems = Array.isArray(invoiceConfig?.lineItems) ? invoiceConfig.lineItems : [];

  return lineItems
    .filter((item) => item?.enabled !== false && item?.active !== false)
    .filter((item) => evaluateConditions(lookup, item?.conditions))
    .map((item) => {
      const calculationType = String(item?.calculationType || 'fixed').trim().toLowerCase();
      const quantity = coercePositiveQuantity(resolveAnswerValue(lookup, item?.quantityField));
      const baseValue = coerceNumericValue(resolveAnswerValue(lookup, item?.sourceField));
      let unitAmount = 0;

      if (calculationType === 'percentage') {
        unitAmount = ((baseValue || 0) * Number(item?.rate || 0)) / 100;
      } else {
        unitAmount = Number(item?.fixedAmount || 0);
      }

      return {
        id: item?.id || null,
        label: String(item?.label || 'Line item').trim() || 'Line item',
        sourceField: item?.sourceField || null,
        quantityField: item?.quantityField || null,
        quantity,
        calculationType,
        includeInSubtotal: item?.includeInSubtotal !== false,
        rate: Number(item?.rate || 0),
        fixedAmount: item?.fixedAmount == null ? null : Number(item.fixedAmount),
        baseValue,
        unitAmount: roundCurrency(unitAmount),
        amount: roundCurrency(unitAmount * quantity),
      };
    });
};

const resolveAdjustmentAmount = ({ config, baseAmount, lookup }) => {
  const enabled = config?.enabled === true;
  const mode = String(config?.mode || 'none').trim().toLowerCase();

  if (!enabled || mode === 'none') {
    return {
      enabled: false,
      mode: 'none',
      value: Number(config?.value || 0),
      amount: 0,
      applies: false,
    };
  }

  const applies = evaluateConditions(lookup, config?.conditions);
  if (!applies) {
    return {
      enabled: true,
      mode,
      value: Number(config?.value || 0),
      amount: 0,
      applies: false,
    };
  }

  const rawValue = Number(config?.value || 0);
  const amount =
    mode === 'percentage'
      ? roundCurrency(baseAmount * (rawValue / 100))
      : roundCurrency(rawValue);

  return {
    enabled: true,
    mode,
    value: rawValue,
    amount: Math.max(0, amount),
    applies: true,
  };
};

const inspectInvoiceCalculationSupport = (projectFormLike) => {
  const normalizedForm = projectFormService.normalizeProjectFormRuntimeConfig(projectFormLike);
  const transaction = normalizedForm?.capabilities?.transaction || {};
  const invoice = transaction?.invoice || {};
  const fieldIds = getExecutableFieldIds(normalizedForm);

  if (invoice?.enabled !== true) {
    return {
      supported: true,
      reason: null,
      message: null,
      normalizedForm,
      invoice,
    };
  }

  const calculationMode = String(invoice?.calculationMode || 'none').trim().toLowerCase();
  if (!SUPPORTED_INVOICE_CALCULATION_MODES.has(calculationMode) || calculationMode === 'none') {
    return {
      supported: false,
      reason: 'invoice_mode_not_supported',
      message: 'This invoice mode is not supported in the public conversational runtime.',
      normalizedForm,
      invoice,
    };
  }

  const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  const hasUnsupportedLineItem = lineItems.some((item) => {
    const calculationType = String(item?.calculationType || 'fixed').trim().toLowerCase();
    if (!SUPPORTED_INVOICE_LINE_ITEM_TYPES.has(calculationType)) {
      return true;
    }
    if (!String(item?.sourceField || '').trim()) {
      return true;
    }
    return Array.isArray(item?.conditions)
      ? item.conditions.some((condition) => {
          const sourceType = String(condition?.sourceType || 'field').trim().toLowerCase();
          const operator = String(condition?.operator || 'eq').trim().toLowerCase();
          return (
            !SUPPORTED_INVOICE_CONDITION_SOURCE_TYPES.has(sourceType) ||
            !SUPPORTED_INVOICE_CONDITION_OPERATORS.has(operator)
          );
        })
      : false;
  });
  if (hasUnsupportedLineItem) {
    return {
      supported: false,
      reason: 'invoice_line_item_not_supported',
      message:
        'One or more invoice line items use unsupported calculation or condition settings.',
      normalizedForm,
      invoice,
    };
  }
  const staleLineItem = lineItems.find((item) => {
    if (item?.enabled === false || item?.active === false) return false;
    return !fieldExists(fieldIds, item?.sourceField);
  });
  if (staleLineItem) {
    return {
      supported: false,
      reason: 'invoice_line_item_source_stale',
      message: `Invoice line item "${String(staleLineItem?.label || 'Line item')}" references a field that no longer exists on the form. Update the source field before collecting payment.`,
      normalizedForm,
      invoice,
    };
  }

  const hasUnsupportedAdjustment = [invoice?.discounts, invoice?.tax].some((config) => {
    const mode = String(config?.mode || 'none').trim().toLowerCase();
    if (!SUPPORTED_INVOICE_ADJUSTMENT_MODES.has(mode)) {
      return true;
    }
    return Array.isArray(config?.conditions)
      ? config.conditions.some((condition) => {
          const sourceType = String(condition?.sourceType || 'field').trim().toLowerCase();
          const operator = String(condition?.operator || 'eq').trim().toLowerCase();
          return (
            !SUPPORTED_INVOICE_CONDITION_SOURCE_TYPES.has(sourceType) ||
            !SUPPORTED_INVOICE_CONDITION_OPERATORS.has(operator)
          );
        })
      : false;
  });

  if (hasUnsupportedAdjustment) {
    return {
      supported: false,
      reason: 'invoice_adjustment_not_supported',
      message: 'This invoice uses unsupported discount, tax, or condition logic.',
      normalizedForm,
      invoice,
    };
  }

  return {
    supported: true,
    reason: null,
    message: null,
    normalizedForm,
    invoice,
  };
};

const inspectPublicInvoiceSupport = (projectFormLike) => {
  const baseSupport = inspectInvoiceCalculationSupport(projectFormLike);
  if (!baseSupport.supported) {
    return baseSupport;
  }

  return baseSupport;
};

const assertInvoiceCalculationSupported = (projectFormLike) => {
  const support = inspectInvoiceCalculationSupport(projectFormLike);
  if (!support.supported) {
    throw new ApiError(httpStatus.BAD_REQUEST, support.message);
  }
  return support;
};

const assertPublicInvoiceRuntimeSupported = (projectFormLike) => {
  const support = inspectPublicInvoiceSupport(projectFormLike);
  if (!support.supported) {
    throw new ApiError(httpStatus.BAD_REQUEST, support.message);
  }
  return support;
};

const evaluateInvoiceSnapshot = async ({
  projectForm,
  submissionData = {},
  allocateNumber = false,
}) => {
  const { normalizedForm, invoice } = assertInvoiceCalculationSupported(projectForm);
  if (invoice?.enabled !== true) {
    return null;
  }

  const transaction = normalizedForm?.capabilities?.transaction || {};
  const payment = transaction?.payment || {};
  const lookup = buildAnswerLookup(submissionData);
  const calculationMode = String(invoice?.calculationMode || 'none').trim().toLowerCase();

  let resolvedBaseAmount = 0;
  let lineItems = [];

  if (calculationMode === 'fixed') {
    resolvedBaseAmount = roundCurrency(invoice?.baseAmount || 0);
  } else if (calculationMode === 'line_items') {
    lineItems = evaluateLineItems(invoice, lookup);
    resolvedBaseAmount = roundCurrency(
      lineItems
        .filter((item) => item.includeInSubtotal !== false)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );
  }

  const discount = resolveAdjustmentAmount({
    config: invoice?.discounts || {},
    baseAmount: resolvedBaseAmount,
    lookup,
  });
  const taxableBase = Math.max(0, roundCurrency(resolvedBaseAmount - discount.amount));
  const tax = resolveAdjustmentAmount({
    config: invoice?.tax || {},
    baseAmount: taxableBase,
    lookup,
  });
  const total = roundCurrency(Math.max(0, taxableBase + tax.amount));

  const numbering =
    allocateNumber
      ? await allocateInvoiceNumber({
          tenantId: normalizedForm?.tenantId,
          projectId: normalizedForm?.projectId,
          projectFormId: normalizedForm?._id || normalizedForm?.formId,
          invoiceConfig: invoice,
        })
      : {
          mode: String(invoice?.invoiceNumbering?.mode || 'auto').trim().toLowerCase(),
          sequence: null,
          prefix: String(invoice?.invoiceNumbering?.prefix || ''),
          value: null,
        };

  return {
    enabled: true,
    calculationMode,
    currency: invoice?.currency || payment?.currency || null,
    subtotal: resolvedBaseAmount,
    taxableBase,
    discount,
    tax: {
      ...tax,
      taxableBase,
    },
    total,
    lineItems,
    amountSourceField: invoice?.amountSourceField || null,
    baseAmount: Number(invoice?.baseAmount || 0),
    invoiceNumbering: {
      mode: String(invoice?.invoiceNumbering?.mode || 'auto').trim().toLowerCase(),
      prefix: String(invoice?.invoiceNumbering?.prefix || ''),
      nextNumber: Math.max(1, Number(invoice?.invoiceNumbering?.nextNumber || 1)),
    },
    invoiceNumber: numbering,
    presentation: {
      ...(invoice?.presentation || {}),
    },
  };
};

module.exports = {
  SUPPORTED_INVOICE_CALCULATION_MODES,
  SUPPORTED_INVOICE_LINE_ITEM_TYPES,
  SUPPORTED_INVOICE_ADJUSTMENT_MODES,
  inspectInvoiceCalculationSupport,
  inspectPublicInvoiceSupport,
  assertInvoiceCalculationSupported,
  assertPublicInvoiceRuntimeSupported,
  allocateInvoiceNumber,
  evaluateInvoiceSnapshot,
};
