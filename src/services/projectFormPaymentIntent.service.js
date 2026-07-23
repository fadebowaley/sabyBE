const httpStatus = require('http-status');
const { createHash, randomUUID } = require('crypto');
const mongoose = require('mongoose');
const { GlobalSettings, Nodes, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const paymentService = require('./payment.service');
const paymentProviderService = require('./paymentProvider.service');
const paymentEventService = require('./paymentEvent.service');
const projectFormService = require('./projectForm.service');
const projectFormInvoiceService = require('./projectFormInvoice.service');

const SUPPORTED_PAYMENT_METHODS = [
  'paystack',
  'flutterwave',
];

const SUPPORTED_TRIGGER_STAGES = ['submission', 'pre_approval', 'post_approval'];
const SUPPORTED_REMITTANCE_ACCOUNT_SOURCES = [
  'tenant_global',
  'specific_node',
  'dynamic_node',
  'form_field',
  'level_nodes',
];

const normalizeToken = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizePaymentMethod = (value) => {
  const candidate = String(value || '')
    .trim()
    .toLowerCase();
  if (!candidate) return null;
  return candidate === 'sabypipe' ? 'sabypay' : candidate;
};

const normalizeTriggerStage = (value) => {
  const candidate = String(value || 'submission')
    .trim()
    .toLowerCase();
  if (candidate === 'before_submit') return 'submission';
  if (candidate === 'before_approval') return 'pre_approval';
  if (candidate === 'after_approval') return 'post_approval';
  return SUPPORTED_TRIGGER_STAGES.includes(candidate) ? candidate : 'submission';
};

const buildSubmissionLookup = (submissionData = {}) => {
  const raw =
    submissionData && typeof submissionData === 'object' ? submissionData : {};
  const normalized = Object.entries(raw).reduce((acc, [key, value]) => {
    const token = normalizeToken(key);
    if (token && acc[token] === undefined) {
      acc[token] = value;
    }
    return acc;
  }, {});

  return {
    raw,
    normalized,
  };
};

const resolveSubmissionValue = (lookup, fieldKey) => {
  const rawKey = String(fieldKey || '').trim();
  if (!rawKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(lookup.raw, rawKey)) {
    return lookup.raw[rawKey];
  }
  return lookup.normalized[normalizeToken(rawKey)];
};

const sanitizeAccount = (account) => {
  if (!account || typeof account !== 'object') return null;
  return {
    id: account.id ? String(account.id) : null,
    label: account.label ? String(account.label) : '',
    accountNumber: account.accountNumber ? String(account.accountNumber) : '',
    bankName: account.bankName ? String(account.bankName) : '',
    bankCode: account.bankCode ? String(account.bankCode) : '',
    bankCategory: account.bankCategory ? String(account.bankCategory) : '',
    accountName: account.accountName ? String(account.accountName) : '',
    isPrimary: account.isPrimary === true,
    isActive: account.isActive !== false,
  };
};

const pickPreferredAccount = (accounts = [], requestedAccountId = null) => {
  const sanitized = Array.isArray(accounts)
    ? accounts.map((entry) => sanitizeAccount(entry)).filter(Boolean)
    : [];
  const active = sanitized.filter((entry) => entry.isActive !== false);
  const requestedId = String(requestedAccountId || '').trim();

  if (requestedId) {
    const exact = active.find((entry) => entry.id === requestedId);
    if (exact) return exact;
  }

  return (
    active.find((entry) => entry.isPrimary === true) ||
    active[0] ||
    sanitized.find((entry) => entry.id === requestedId) ||
    null
  );
};

const resolveTenantAccounts = async (tenantId) => {
  if (!tenantId) return [];
  const settings = await GlobalSettings.findOne({ tenantId }).lean();
  return Array.isArray(settings?.receivingAccounts) ? settings.receivingAccounts : [];
};

const resolveNodeByIdentifier = async ({ tenantId, nodeIdentifier }) => {
  const raw = String(nodeIdentifier || '').trim();
  if (!raw) return null;

  const query = { tenantId, deletedAt: null };
  if (mongoose.Types.ObjectId.isValid(raw)) {
    query.$or = [{ _id: raw }, { nodeId: raw }];
  } else {
    query.nodeId = raw;
  }

  return Nodes.findOne(query).lean();
};

const resolveNodeWithLineageByIdentifier = async ({ tenantId, nodeIdentifier }) => {
  const raw = String(nodeIdentifier || '').trim();
  if (!raw) return null;

  const query = { tenantId, deletedAt: null };
  if (mongoose.Types.ObjectId.isValid(raw)) {
    query.$or = [{ _id: raw }, { nodeId: raw }];
  } else {
    query.nodeId = raw;
  }

  return Nodes.findOne(query)
    .populate('level')
    .populate({
      path: 'identity',
      populate: { path: 'level' },
    })
    .lean();
};

const resolveLineageLevelNode = async ({
  tenantId,
  originNodeIdentifier,
  targetLevelId,
}) => {
  const originNode = await resolveNodeWithLineageByIdentifier({
    tenantId,
    nodeIdentifier: originNodeIdentifier,
  });
  if (!originNode) {
    return { originNode: null, settlementNode: null };
  }

  const normalizedTargetLevelId = String(targetLevelId || '').trim();
  const lineage = [
    ...(Array.isArray(originNode.identity) ? originNode.identity : []),
    originNode,
  ].filter(Boolean);
  const settlementNode = lineage.find((entry) => {
    const entryLevelId = String(entry?.level?._id || entry?.level || '').trim();
    return entryLevelId && entryLevelId === normalizedTargetLevelId;
  });

  return {
    originNode,
    settlementNode: settlementNode || null,
  };
};

const resolveNodeAccount = async ({
  tenantId,
  nodeIdentifier,
  requestedAccountId = null,
}) => {
  const node = await resolveNodeByIdentifier({ tenantId, nodeIdentifier });
  if (!node) return { node: null, account: null };
  const accounts = Array.isArray(node?.profile?.receivingAccounts)
    ? node.profile.receivingAccounts
    : [];
  return {
    node,
    account: pickPreferredAccount(accounts, requestedAccountId),
  };
};

const resolveCollectionAccount = async ({
  tenantId,
  paymentConfig,
  remittanceConfig,
}) => {
  const configuredAccountId = String(paymentConfig?.receivingAccount || '').trim() || null;
  const fallbackAccountId =
    String(remittanceConfig?.routing?.fallbackAccountId || '').trim() || null;
  const accounts = await resolveTenantAccounts(tenantId);
  const account = pickPreferredAccount(
    accounts,
    configuredAccountId || fallbackAccountId
  );

  return {
    accountId: account?.id || configuredAccountId || fallbackAccountId || null,
    account,
    source: 'tenant_global',
  };
};

const resolveRemittancePlan = async ({
  normalizedForm,
  remittanceConfig,
  paymentConfig,
  submissionData = {},
  respondentContext = {},
}) => {
  if (remittanceConfig?.enabled !== true) {
    return {
      enabled: false,
      remittanceConfigId: null,
      beneficiaryType: 'tenant',
      accountSource: null,
      destination: null,
      settlementRule: null,
      routing: null,
    };
  }

  const accountSource = String(remittanceConfig?.accountSource || 'tenant_global')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_REMITTANCE_ACCOUNT_SOURCES.includes(accountSource)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This settlement account source is not supported yet for payment collection.'
    );
  }

  const settlementMode = String(remittanceConfig?.settlementRule?.mode || 'single')
    .trim()
    .toLowerCase();
  if (settlementMode !== 'single') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only single-destination settlement is supported in this payment flow right now.'
    );
  }

  if (remittanceConfig?.routing?.bySubmissionValue === true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Value-based settlement routing is not supported in this payment flow yet.'
    );
  }

  const lookup = buildSubmissionLookup(submissionData);
  const fallbackAccountId =
    String(remittanceConfig?.routing?.fallbackAccountId || '').trim() || null;

  let destination = null;

  if (accountSource === 'tenant_global') {
    const accounts = await resolveTenantAccounts(normalizedForm.tenantId);
    const account = pickPreferredAccount(
      accounts,
      fallbackAccountId || paymentConfig?.receivingAccount || null
    );
    destination = {
      type: 'tenant_global',
      nodeId: null,
      accountId: account?.id || fallbackAccountId || null,
      account,
    };
  } else if (accountSource === 'specific_node') {
    const { node, account } = await resolveNodeAccount({
      tenantId: normalizedForm.tenantId,
      nodeIdentifier: remittanceConfig?.specificNodeId,
      requestedAccountId: fallbackAccountId,
    });
    if (!node || !account) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'The selected settlement node does not have an active receiving account.'
      );
    }
    destination = {
      type: 'specific_node',
      nodeId: String(node._id),
      nodeName: node.name ? String(node.name) : null,
      accountId: account.id || null,
      account,
    };
  } else if (accountSource === 'level_nodes') {
    const targetLevelId = String(remittanceConfig?.targetLevelId || '').trim();
    if (!targetLevelId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Level-based settlement requires a collection parent level.'
      );
    }

    const originNodeIdentifier =
      String(
        respondentContext?.selectedNodeId ||
          respondentContext?.nodeId ||
          respondentContext?.originNodeId ||
          respondentContext?.nodeIdentifier ||
          resolveSubmissionValue(lookup, remittanceConfig?.nodeAccountField) ||
          ''
      ).trim() || null;
    if (!originNodeIdentifier) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Level-based settlement requires an originating node for this submission.'
      );
    }

    const { originNode, settlementNode } = await resolveLineageLevelNode({
      tenantId: normalizedForm.tenantId,
      originNodeIdentifier,
      targetLevelId,
    });
    if (!originNode) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'The originating node for settlement could not be found.'
      );
    }
    if (!settlementNode) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'The originating node does not have an ancestor at the selected settlement level.'
      );
    }

    const account = pickPreferredAccount(
      Array.isArray(settlementNode?.profile?.receivingAccounts)
        ? settlementNode.profile.receivingAccounts
        : [],
      null
    );
    if (!account) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'The resolved settlement parent node does not have an active receiving account.'
      );
    }
    destination = {
      type: 'ancestor_level_node',
      nodeId: String(settlementNode._id),
      nodeName: settlementNode.name ? String(settlementNode.name) : null,
      accountId: account.id || null,
      account,
      sourceNodeId: String(originNode._id),
      sourceNodeReference: originNode.nodeId ? String(originNode.nodeId) : null,
      sourceNodeName: originNode.name ? String(originNode.name) : null,
      sourceLevelId: String(originNode?.level?._id || originNode?.level || ''),
      targetLevelId,
    };
  } else {
    const fieldKey =
      accountSource === 'dynamic_node'
        ? remittanceConfig?.nodeAccountField
        : remittanceConfig?.nodeAccountField;
    const nodeIdentifier = resolveSubmissionValue(lookup, fieldKey);
    const { node, account } = await resolveNodeAccount({
      tenantId: normalizedForm.tenantId,
      nodeIdentifier,
      requestedAccountId: fallbackAccountId,
    });
    if (!nodeIdentifier || !node || !account) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'This settlement flow requires a submitted node with an active receiving account.'
      );
    }
    destination = {
      type: accountSource === 'dynamic_node' ? 'dynamic_node' : 'form_field',
      nodeId: String(node._id),
      nodeName: node.name ? String(node.name) : null,
      sourceField: String(fieldKey || ''),
      accountId: account.id || null,
      account,
    };
  }

  if (!destination?.accountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Settlement is enabled but no destination receiving account could be resolved.'
    );
  }

  return {
    enabled: true,
    remittanceConfigId: `project-form:${String(normalizedForm._id || normalizedForm.formId)}:remittance`,
    beneficiaryType: 'tenant',
    accountSource,
    destination,
    settlementRule: {
      mode: settlementMode,
      splitType: String(remittanceConfig?.settlementRule?.splitType || 'selection'),
    },
    routing: {
      byNode: remittanceConfig?.routing?.byNode === true,
      bySubmissionValue: false,
      fallbackAccountId,
    },
  };
};

const buildRespondentKey = ({
  normalizedForm,
  submissionData = {},
  respondentContext = {},
}) => {
  const parts = [
    respondentContext?.authenticatedUserId,
    respondentContext?.userId,
    respondentContext?.email,
    respondentContext?.phone,
    respondentContext?.identifier,
    respondentContext?.selectedNodeId,
    respondentContext?.nodeId,
    respondentContext?.originNodeId,
    respondentContext?.nodeIdentifier,
  ]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  if (parts.length) {
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  const payloadHash = createHash('sha256')
    .update(
      JSON.stringify({
        formId: String(normalizedForm?._id || normalizedForm?.formId || ''),
        submissionData,
      })
    )
    .digest('hex');

  return payloadHash;
};

const resolveCustomerIdentity = ({
  normalizedForm,
  submissionData = {},
  respondentContext = {},
}) => {
  const lookup = buildSubmissionLookup(submissionData);
  const mappingFields = normalizedForm?.smartMappings?.fields || {};
  const resolveMappedValue = (mappingKey, fallbacks = []) => {
    const candidateKeys = [
      mappingFields?.[mappingKey],
      ...fallbacks,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    for (const key of candidateKeys) {
      const value = resolveSubmissionValue(lookup, key);
      if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return null;
  };

  const email =
    String(
      respondentContext?.email ||
        resolveMappedValue('email', ['email', 'email_address'])
    ).trim().toLowerCase() || null;
  const phone =
    String(
      respondentContext?.phone ||
        resolveMappedValue('phone', ['phone', 'phone_number', 'mobile'])
    ).trim() || null;
  const fullName =
    String(
      respondentContext?.fullName ||
        resolveMappedValue('fullName', ['full_name', 'fullname', 'name'])
    ).trim() || null;

  return {
    email,
    phone,
    fullName,
  };
};

const buildPaymentReference = () =>
  `COL-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase()}`;

const prepareProjectFormPaymentIntent = async ({
  projectForm,
  submissionData = {},
  requestedChannel = null,
  triggerStage = 'submission',
  submissionId = null,
  respondentContext = {},
}) => {
  const normalizedForm = projectFormService.normalizeProjectFormRuntimeConfig(projectForm);
  const transaction = normalizedForm?.capabilities?.transaction || {};
  const paymentConfig = transaction?.payment || {};
  const remittanceConfig = transaction?.remittance || {};

  if (paymentConfig?.enabled !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment is not enabled for this form.'
    );
  }

  if (transaction?.invoice?.enabled !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invoice configuration is required before a payment intent can be created.'
    );
  }

  const collectionStage = normalizeTriggerStage(paymentConfig?.collectionStage);
  const requestedTriggerStage = normalizeTriggerStage(triggerStage);
  if (collectionStage !== requestedTriggerStage) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This form collects payment at ${collectionStage.replace(/_/g, ' ')}, not ${requestedTriggerStage.replace(/_/g, ' ')}.`
    );
  }

  if (
    paymentConfig?.policies?.requirePaymentBeforeSubmit === true &&
    collectionStage !== 'submission'
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Require payment before submit can only be used when collection stage is submission.'
    );
  }

  const enabledChannels = Array.isArray(paymentConfig?.enabledChannels)
    ? paymentConfig.enabledChannels
        .map((entry) => normalizePaymentMethod(entry))
        .filter((entry) => entry && SUPPORTED_PAYMENT_METHODS.includes(entry))
    : [];
  if (!enabledChannels.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'At least one supported payment channel must be enabled.'
    );
  }

  const preferredChannel = normalizePaymentMethod(requestedChannel);
  if (preferredChannel && !enabledChannels.includes(preferredChannel)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'The requested payment channel is not enabled for this form.'
    );
  }

  const defaultChannel = normalizePaymentMethod(paymentConfig?.defaultChannel);
  const paymentMethod =
    preferredChannel ||
    (defaultChannel && enabledChannels.includes(defaultChannel)
      ? defaultChannel
      : enabledChannels[0]);

  const invoiceSnapshot = await projectFormInvoiceService.evaluateInvoiceSnapshot({
    projectForm: normalizedForm,
    submissionData,
    allocateNumber: false,
  });
  if (!invoiceSnapshot?.enabled) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'An invoice total could not be prepared for this payment.'
    );
  }

  if (Number(invoiceSnapshot.total || 0) <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Calculated invoice total must be greater than zero before payment can start.'
    );
  }

  const collectionAccount = await resolveCollectionAccount({
    tenantId: normalizedForm.tenantId,
    paymentConfig,
    remittanceConfig,
  });

  const remittancePlan = await resolveRemittancePlan({
    normalizedForm,
    remittanceConfig,
    paymentConfig,
    submissionData,
    respondentContext,
  });

  const respondentKey = buildRespondentKey({
    normalizedForm,
    submissionData,
    respondentContext,
  });
  const userId =
    String(
      respondentContext?.authenticatedUserId ||
        respondentContext?.userId ||
        ''
    ).trim() || `public:${String(normalizedForm._id || normalizedForm.formId)}:${respondentKey.slice(0, 24)}`;

  const invoiceHash = createHash('sha256')
    .update(JSON.stringify(invoiceSnapshot))
    .digest('hex');
  const idempotencyKey = [
    'project-form-payment-intent',
    String(normalizedForm.tenantId || ''),
    String(normalizedForm._id || normalizedForm.formId || ''),
    requestedTriggerStage,
    paymentMethod,
    respondentKey.slice(0, 16),
    invoiceHash.slice(0, 16),
  ].join(':');

  const collectionPlan = {
    paymentMethod,
    currency:
      String(paymentConfig?.currency || invoiceSnapshot?.currency || '').trim() || null,
    collectionStage,
    settlementType: String(paymentConfig?.settlementType || 'none'),
    accountSource: collectionAccount.source,
    receivingAccountId: collectionAccount.accountId,
    receivingAccount: collectionAccount.account,
    enabledChannels,
    defaultChannel: paymentMethod,
    providerConfig:
      paymentConfig?.channelConfigs &&
      typeof paymentConfig.channelConfigs === 'object'
        ? paymentConfig.channelConfigs[paymentMethod] || null
        : null,
    policies: {
      requirePaymentBeforeSubmit:
        paymentConfig?.policies?.requirePaymentBeforeSubmit === true,
      allowPartialPayment: paymentConfig?.policies?.allowPartialPayment === true,
      allowOverpayment: paymentConfig?.policies?.allowOverpayment === true,
      refundPolicy: String(paymentConfig?.policies?.refundPolicy || 'none'),
    },
  };

  if (!collectionPlan.currency) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'A transaction currency is required before payment can be created.'
    );
  }

  return {
    normalizedForm,
    invoiceSnapshot,
    collectionPlan,
    remittancePlan,
    paymentPayload: {
      tenantId: normalizedForm.tenantId,
      userId,
      amount: Number(invoiceSnapshot.total || 0),
      total: Number(invoiceSnapshot.total || 0),
      currency: collectionPlan.currency,
      status: 'pending',
      purpose: 'collection',
      beneficiaryType: remittancePlan?.beneficiaryType || 'tenant',
      submissionId: submissionId ? String(submissionId) : null,
      moduleId: String(
        normalizedForm.projectId ||
          normalizedForm.formId ||
          normalizedForm._id ||
          ''
      ),
      remittanceConfigId: remittancePlan?.remittanceConfigId || null,
      reference: buildPaymentReference(),
      paymentMethod,
      idempotencyKey,
      metadata: {
        source: 'project_form_public_runtime',
        projectFormId: String(normalizedForm._id || normalizedForm.formId || ''),
        projectId: String(normalizedForm.projectId || ''),
        publicRef: normalizedForm.publicRef || null,
        shareRef: normalizedForm.shareRef || null,
        submissionDraftId: submissionId ? String(submissionId) : null,
        invoiceSnapshot,
        collectionPlan,
        remittancePlan,
        respondentContext: {
          authenticatedUserId: respondentContext?.authenticatedUserId || null,
          userId: respondentContext?.userId || null,
          email: respondentContext?.email || null,
          phone: respondentContext?.phone || null,
          identifier: respondentContext?.identifier || null,
          selectedNodeId:
            respondentContext?.selectedNodeId || respondentContext?.nodeId || null,
          originNodeId:
            respondentContext?.originNodeId ||
            respondentContext?.nodeIdentifier ||
            null,
        },
        provider: {
          name: paymentMethod,
          initializationStatus: 'pending_adapter',
        },
      },
      paymentDetails: {
        provider: paymentMethod,
        initializationStatus: 'pending_adapter',
      },
    },
  };
};

const createProjectFormPaymentIntent = async (params) => {
  const prepared = await prepareProjectFormPaymentIntent(params);
  const { payment, created } = await paymentService.createOrGetPayment(
    prepared.paymentPayload
  );

  const customer = resolveCustomerIdentity({
    normalizedForm: prepared.normalizedForm,
    submissionData: params?.submissionData || {},
    respondentContext: params?.respondentContext || {},
  });
  const checkout = await paymentProviderService.initializeHostedCheckout({
    payment,
    paymentMethod: prepared.collectionPlan.paymentMethod,
    customer,
    invoiceSnapshot: prepared.invoiceSnapshot,
    respondentContext: params?.respondentContext || {},
  });

  const nextMetadata = {
    ...(payment.metadata || {}),
    provider: {
      ...(payment.metadata?.provider || {}),
      name: checkout.provider || prepared.collectionPlan.paymentMethod,
      initializationStatus: checkout.status || 'pending_adapter',
      authorizationUrl: checkout.authorizationUrl || null,
      accessCode: checkout.accessCode || null,
      message: checkout.message || null,
    },
    customer,
  };
  const nextPaymentDetails = {
    ...(payment.paymentDetails || {}),
    provider: checkout.provider || prepared.collectionPlan.paymentMethod,
    initializationStatus: checkout.status || 'pending_adapter',
    authorizationUrl: checkout.authorizationUrl || null,
    accessCode: checkout.accessCode || null,
  };

  const updatedPayment = await paymentService.updatePaymentById(
    payment._id,
    {
      providerRef: checkout.providerRef || payment.providerRef || null,
      metadata: nextMetadata,
      paymentDetails: nextPaymentDetails,
    },
    payment.tenantId
  );

  await paymentEventService.appendPaymentEvent({
    tenantId: updatedPayment.tenantId,
    payment: updatedPayment,
    eventType: 'provider_checkout_initialized',
    fromStatus: updatedPayment.status,
    toStatus: updatedPayment.status,
    userId: updatedPayment.userId,
    source: 'project-form-payment-intent',
    sourceRef: String(prepared.normalizedForm._id || prepared.normalizedForm.formId || ''),
    dedupeKey: `provider-checkout-initialized:${updatedPayment.id}:${checkout.provider || updatedPayment.paymentMethod}`,
    metadata: {
      provider: checkout.provider || updatedPayment.paymentMethod,
      status: checkout.status || 'pending_adapter',
      supported: checkout.supported === true,
      providerRef: checkout.providerRef || null,
    },
  });

  return {
    created,
    payment: updatedPayment,
    intent: {
      paymentId: String(updatedPayment._id || updatedPayment.id),
      reference: updatedPayment.reference,
      status: updatedPayment.status,
      amount: updatedPayment.amount,
      total: updatedPayment.total,
      currency: updatedPayment.currency,
      paymentMethod: updatedPayment.paymentMethod,
      collectionStage: prepared.collectionPlan.collectionStage,
      requirePaymentBeforeSubmit:
        prepared.collectionPlan.policies.requirePaymentBeforeSubmit === true,
      invoiceSnapshot: prepared.invoiceSnapshot,
      collectionPlan: prepared.collectionPlan,
      remittancePlan: prepared.remittancePlan,
      checkout: {
        provider: checkout.provider || updatedPayment.paymentMethod,
        status: checkout.status || 'pending_adapter',
        supported: checkout.supported === true,
        message: checkout.message || null,
        authorizationUrl: checkout.authorizationUrl || null,
        accessCode: checkout.accessCode || null,
      },
    },
  };
};

const getProjectFormPaymentStatus = async ({
  projectForm,
  paymentReference,
}) => {
  const normalizedForm = projectFormService.normalizeProjectFormRuntimeConfig(projectForm);
  const reference = String(paymentReference || '').trim();
  if (!reference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'paymentReference is required.');
  }

  const payment = await Payment.findOne({
    tenantId: normalizedForm.tenantId,
    reference,
    'metadata.projectFormId': String(normalizedForm._id || normalizedForm.formId || ''),
  }).lean();

  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found for this form.');
  }

  return {
    paymentId: String(payment._id || payment.id),
    reference: payment.reference,
    status: payment.status,
    amount: payment.amount,
    total: payment.total,
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
    providerRef: payment.providerRef || null,
    checkout: {
      provider:
        payment?.metadata?.provider?.name ||
        payment?.paymentDetails?.provider ||
        payment.paymentMethod,
      status:
        payment?.metadata?.provider?.initializationStatus ||
        payment?.paymentDetails?.initializationStatus ||
        null,
      supported:
        Boolean(
          payment?.metadata?.provider?.authorizationUrl ||
            payment?.paymentDetails?.authorizationUrl
        ) || payment.status === 'completed',
      message: payment?.metadata?.provider?.message || null,
      authorizationUrl:
        payment?.metadata?.provider?.authorizationUrl ||
        payment?.paymentDetails?.authorizationUrl ||
        null,
      accessCode:
        payment?.metadata?.provider?.accessCode ||
        payment?.paymentDetails?.accessCode ||
        null,
    },
  };
};

module.exports = {
  SUPPORTED_PAYMENT_METHODS,
  prepareProjectFormPaymentIntent,
  createProjectFormPaymentIntent,
  getProjectFormPaymentStatus,
};
