const FINANCIAL_FIELD_DEFINITIONS = [
  {
    field_key: 'payment_status',
    field_label: 'Payment Status',
    field_type: 'payment_status',
    transformations: ['raw', 'categorical'],
    metadata: { badge: true, tone: 'payment_status' },
    capability: 'payment',
  },
  {
    field_key: 'payment_amount_paid',
    field_label: 'Amount Paid',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'payment',
  },
  {
    field_key: 'payment_total',
    field_label: 'Payment Total',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'payment',
  },
  {
    field_key: 'payment_currency',
    field_label: 'Payment Currency',
    field_type: 'text',
    transformations: ['raw'],
    capability: 'payment',
  },
  {
    field_key: 'payment_reference',
    field_label: 'Payment Reference',
    field_type: 'text',
    transformations: ['raw'],
    capability: 'payment',
  },
  {
    field_key: 'payment_method',
    field_label: 'Payment Method',
    field_type: 'text',
    transformations: ['raw', 'categorical'],
    capability: 'payment',
  },
  {
    field_key: 'payment_provider',
    field_label: 'Payment Provider',
    field_type: 'text',
    transformations: ['raw', 'categorical'],
    capability: 'payment',
  },
  {
    field_key: 'invoice_subtotal',
    field_label: 'Invoice Subtotal',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'invoice',
  },
  {
    field_key: 'invoice_tax',
    field_label: 'Tax',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'invoice',
  },
  {
    field_key: 'invoice_discount',
    field_label: 'Discount',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'invoice',
  },
  {
    field_key: 'invoice_total',
    field_label: 'Invoice Total',
    field_type: 'currency',
    transformations: ['raw', 'sum', 'avg', 'min', 'max'],
    capability: 'invoice',
  },
  {
    field_key: 'invoice_number',
    field_label: 'Invoice Number',
    field_type: 'text',
    transformations: ['raw'],
    capability: 'invoice',
  },
];

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const amountFromAdjustment = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    return toNumberOrNull(value);
  }
  if (typeof value === 'object') {
    return toNumberOrNull(value.amount);
  }
  return null;
};

const resolveInvoiceNumber = (invoice = {}) => {
  const explicit = invoice.invoiceNumber;
  if (typeof explicit === 'string' || typeof explicit === 'number') {
    return String(explicit);
  }
  if (explicit && typeof explicit === 'object') {
    const prefix = explicit.prefix || '';
    const value = explicit.value ?? explicit.sequence ?? null;
    return hasValue(value) ? `${prefix}${value}` : null;
  }

  const numbering = asObject(invoice.invoiceNumbering);
  const value = numbering.value ?? numbering.sequence ?? null;
  return hasValue(value) ? `${numbering.prefix || ''}${value}` : null;
};

const buildTransactionMeta = (metadata = {}, invoiceSnapshot = null) => {
  const incomingTransaction = asObject(asObject(metadata).transaction);
  if (!invoiceSnapshot) {
    return Object.keys(incomingTransaction).length ? incomingTransaction : undefined;
  }
  return {
    ...incomingTransaction,
    invoiceSnapshot,
  };
};

const buildInvoiceSnapshot = (invoiceSnapshot = null) => {
  if (!invoiceSnapshot || typeof invoiceSnapshot !== 'object') return null;
  return {
    currency: invoiceSnapshot.currency || null,
    subtotal: invoiceSnapshot.subtotal ?? null,
    taxableBase: invoiceSnapshot.taxableBase ?? null,
    discount: invoiceSnapshot.discount || null,
    tax: invoiceSnapshot.tax || null,
    total: invoiceSnapshot.total ?? null,
    lineItems: Array.isArray(invoiceSnapshot.lineItems)
      ? invoiceSnapshot.lineItems
      : [],
    invoiceNumbering: invoiceSnapshot.invoiceNumbering || null,
    invoiceNumber: invoiceSnapshot.invoiceNumber || null,
  };
};

const buildPaymentSnapshot = ({ transaction = {}, invoice = null } = {}) => {
  const paymentReference =
    transaction.paymentIntentReference ||
    transaction.paymentReference ||
    transaction.reference ||
    null;

  const hasPaymentSignal = Boolean(
    paymentReference ||
      transaction.paymentIntentId ||
      transaction.paymentId ||
      transaction.paymentIntentStatus ||
      transaction.paymentStatus ||
      transaction.paymentMethod
  );

  if (!hasPaymentSignal) {
    return null;
  }

  return {
    reference: paymentReference,
    paymentId: transaction.paymentIntentId || transaction.paymentId || null,
    status:
      transaction.paymentIntentStatus ||
      transaction.paymentStatus ||
      transaction.status ||
      'pending',
    amountPaid: transaction.amountPaid ?? null,
    amount: transaction.amount ?? invoice?.total ?? null,
    total: transaction.total ?? invoice?.total ?? null,
    currency: transaction.currency || invoice?.currency || null,
    paymentMethod: transaction.paymentMethod || null,
    provider: transaction.provider || null,
    providerRef: transaction.providerRef || null,
    paymentType: transaction.paymentType || null,
    subtotal: invoice?.subtotal ?? transaction.subtotal ?? null,
    taxableBase: invoice?.taxableBase ?? transaction.taxableBase ?? null,
    tax: invoice?.tax || transaction.tax || null,
    discount: invoice?.discount || transaction.discount || null,
    invoice: invoice || transaction.invoiceSnapshot || null,
    completedAt: transaction.paidAt || transaction.completedAt || null,
    updatedAt: transaction.syncedAt || transaction.updatedAt || null,
  };
};

const buildFlatFinancialFields = ({ invoice = null, payment = null } = {}) => {
  const flat = {};
  const sourceInvoice = invoice || asObject(payment?.invoice);

  if (payment) {
    flat.payment_status = payment.status || 'pending';
    flat.payment_amount_paid = toNumberOrNull(payment.amountPaid);
    flat.payment_total = toNumberOrNull(payment.total ?? payment.amount ?? sourceInvoice?.total);
    flat.payment_currency = payment.currency || sourceInvoice?.currency || null;
    flat.payment_reference = payment.reference || null;
    flat.payment_method = payment.paymentMethod || payment.paymentType || null;
    flat.payment_provider = payment.provider || null;
  }

  if (sourceInvoice && Object.keys(sourceInvoice).length) {
    flat.invoice_subtotal = toNumberOrNull(sourceInvoice.subtotal);
    flat.invoice_tax = amountFromAdjustment(sourceInvoice.tax);
    flat.invoice_discount = amountFromAdjustment(sourceInvoice.discount);
    flat.invoice_total = toNumberOrNull(sourceInvoice.total);
    flat.invoice_number = resolveInvoiceNumber(sourceInvoice);

    if (!hasValue(flat.payment_total)) {
      flat.payment_total = flat.invoice_total;
    }
    if (!hasValue(flat.payment_currency)) {
      flat.payment_currency = sourceInvoice.currency || null;
    }
  }

  return Object.fromEntries(
    Object.entries(flat).filter(([, value]) => value !== undefined)
  );
};

const buildFinancialSubmissionData = ({
  submissionData = {},
  metadata = {},
  invoiceSnapshot = null,
}) => {
  const transaction = buildTransactionMeta(metadata, invoiceSnapshot);
  if (!transaction) return submissionData;

  const invoice = buildInvoiceSnapshot(invoiceSnapshot);
  const payment = buildPaymentSnapshot({ transaction, invoice });
  const flatFields = buildFlatFinancialFields({ invoice, payment });

  return {
    ...submissionData,
    ...flatFields,
    ...(invoice ? { __invoice: invoice } : {}),
    ...(payment ? { __payment: payment } : {}),
  };
};

const hasEnabledCapability = (capabilityConfig) =>
  Boolean(capabilityConfig?.enabled || capabilityConfig?.active);

const getFinancialCatalogDefinitionsForForm = (formDoc, baseOrder = 0) => {
  const transaction = asObject(formDoc?.capabilities?.transaction);
  const paymentEnabled = hasEnabledCapability(transaction.payment);
  const invoiceEnabled = hasEnabledCapability(transaction.invoice);

  if (!paymentEnabled && !invoiceEnabled) return [];

  return FINANCIAL_FIELD_DEFINITIONS.filter((definition) => {
    if (definition.capability === 'payment') return paymentEnabled;
    if (definition.capability === 'invoice') return invoiceEnabled;
    return false;
  }).map((definition, index) => ({
    project_id: formDoc.projectId,
    tenant_id: formDoc.tenantId,
    form_id: formDoc.formId || formDoc.projectId,
    field_id: definition.field_key,
    field_key: definition.field_key,
    field_label: definition.field_label,
    field_type: definition.field_type,
    is_required: false,
    options: [],
    aliases: [definition.field_key, definition.field_label.toLowerCase()],
    transformations: definition.transformations || ['raw'],
    metadata: {
      ...(definition.metadata || {}),
      system: true,
      readonly: true,
      hiddenOnPublicForm: true,
      source: 'transaction',
      capability: definition.capability,
      order: baseOrder + index,
    },
  }));
};

module.exports = {
  FINANCIAL_FIELD_DEFINITIONS,
  buildTransactionMeta,
  buildFinancialSubmissionData,
  buildFlatFinancialFields,
  buildInvoiceSnapshot,
  buildPaymentSnapshot,
  getFinancialCatalogDefinitionsForForm,
};
