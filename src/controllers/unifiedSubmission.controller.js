const mongoose = require('mongoose');
const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const {
  queueSubmission,
  queueUpdateSubmission,
  queueDeleteSubmission,
  getActivityLogs: getActivityLogsService,
  getActivityLogSummary: getActivityLogSummaryService,
  listSubmissions: listSubmissionsService,
  getEnhancedActivityLogs: getEnhancedActivityLogsService,
} = require('../services/submission.service');
const { logActivity } = require('../utils/activityLogger');
const SubmissionModel = require('../models/submission.model');
const ActivityLogModel = require('../models/activityLog.model');
const ProjectForm = require('../models/projectForm.model');
const { Payment, PaymentSettlement } = require('../models');
const {
  eventCalendarService,
  eventComplianceService,
  projectFormService,
} = require('../services');
const { getAllowedDates } = require('../services/calendarEnforcement.service');
const Nodes = require('../models/node.model');
const { postgresPool } = require('../config/postgres');
const { buildDeterministicIdempotencyKey } = require('../utils/idempotency');
const copilotActionService = require('../services/copilotAction.service');
const publicSubmissionValidationService = require('../services/publicSubmissionValidation.service');
const projectFormInvoiceService = require('../services/projectFormInvoice.service');
const {
  buildFinancialSubmissionData,
  buildTransactionMeta,
} = require('../services/submissionFinancialFields.service');

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const resolveNodeIdToObjectId = async (tenantId, nodeIdOrObjectId) => {
  if (!nodeIdOrObjectId) return null;
  if (mongoose.Types.ObjectId.isValid(nodeIdOrObjectId)) {
    return {
      objectId: nodeIdOrObjectId,
      nodeRef: null,
      nodeName: null,
    };
  }

  const nodeDoc = await Nodes.findOne({ tenantId, nodeId: nodeIdOrObjectId })
    .select('_id nodeId name')
    .lean();

  if (!nodeDoc) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unknown nodeId: ${nodeIdOrObjectId}`);
  }

  return {
    objectId: nodeDoc._id.toString(),
    nodeRef: nodeDoc.nodeId || nodeIdOrObjectId,
    nodeName: nodeDoc.name || null,
  };
};

/**
 * Universal submission endpoint - handles ALL submission types
 * Automatically detects PERM vs regular submissions
 * @route POST /v1/submissions
 */
const submitData = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: (req.user && req.user.tenantId) || req.body.tenantId,
    userId: req.user ? req.user._id : undefined,
    source: req.body.source || 'api',
  };

  // Extract all fields (regular + PERM + Submitter Blueprint)
  const submissionBody = pick(req.body, [
    'tenantId',
    'projectId',
    'project_name',
    'project_category',
    'formId',
    'nodeId',//complete node payload sub 
    'node_id', // snake_case alias from clients
    'userId', // complete user payload sub
    'payload',
    'source',
    'meta',
    'status',
    'idempotency_key',
    'month', // PERM field
    'year', // PERM field
    'perm_enabled', // PERM field
    'event_date', // PERM per-date field
    'submission_date', // PERM per-date alias
    // Submitter Blueprint
    'user_name',
    'user_email',
    'user_phone',
    'node_name',
    'node_reference',
    'form_reference',
  ]);

  // Merge with user info
  submissionBody.tenantId = userInfo.tenantId;
  submissionBody.userId = userInfo.userId || submissionBody.userId;
  submissionBody.source = submissionBody.source || userInfo.source;

  // Normalise nodeId from either camelCase or snake_case (for activity log node_id)
  const nodeId = (submissionBody.nodeId || submissionBody.node_id || '').trim() || null;
  submissionBody.nodeId = nodeId;
  if (submissionBody.node_id !== undefined) delete submissionBody.node_id;
  logger.info(
    `[Submit] nodeId resolved: ${nodeId || 'null'} (from body.nodeId=${req.body?.nodeId ?? 'undefined'}, body.node_id=${req.body?.node_id ?? 'undefined'})`
  );

  // Validate required fields (projectId, formId, payload)
  if (!submissionBody.projectId || !submissionBody.formId || !submissionBody.payload) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: projectId, formId, payload'
    );
  }

  // Fetch form to check PERM settings and resolve tenantId
  const form = await ProjectForm.findOne({
    projectId: submissionBody.projectId,
  }).select('capabilities.experience.compliance formId projectId tenantId');

  if (!form) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  // Resolve tenantId: user/body first, fallback to form
  if (!submissionBody.tenantId && form.tenantId) {
    submissionBody.tenantId = form.tenantId;
  }
  if (!submissionBody.tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required field: tenantId (ensure user is authenticated or form has tenant)'
    );
  }

  // Accept business nodeId (reference code) from clients and resolve to DB object id.
  if (submissionBody.nodeId) {
    const resolvedNode = await resolveNodeIdToObjectId(
      submissionBody.tenantId,
      submissionBody.nodeId
    );
    if (resolvedNode) {
      submissionBody.nodeId = resolvedNode.objectId;
      submissionBody.node_reference =
        submissionBody.node_reference || resolvedNode.nodeRef || undefined;
      submissionBody.node_name =
        submissionBody.node_name || resolvedNode.nodeName || undefined;
    }
  }

  // Generate deterministic idempotency key when client does not provide one.
  if (!submissionBody.idempotency_key) {
    const effectiveEventDate =
      submissionBody.event_date ||
      submissionBody.submission_date ||
      null;
    submissionBody.idempotency_key = buildDeterministicIdempotencyKey({
      tenant_id: submissionBody.tenantId,
      project_id: submissionBody.projectId,
      form_id: submissionBody.formId,
      node_id: submissionBody.nodeId,
      event_date: effectiveEventDate,
      submitter_id: submissionBody.userId,
      payload: submissionBody.payload,
    });
  }

  // Determine whether this is a PERM submission.
  //
  // The source of truth is the FORM's own configuration: if the form owner
  // has set permSettings.enabled = true the submission is PERM regardless of
  // what the caller sends.  A caller may also explicitly opt-in by sending
  // perm_enabled: true (e.g. sabyFrontend PERM flows).
  //
  // This keeps the flag predictable: a form is either a PERM form or it isn't.
  // Non-PERM forms that happen to carry a nodeId (for analytics/tracing) are
  // not accidentally promoted to PERM mode.
  const isPERM =
    form.capabilities?.experience?.compliance?.enabled === true ||
    submissionBody.perm_enabled === true;

  if (isPERM) {
    submissionBody.perm_enabled = true; // Normalise the flag
    const trackingMode =
      form?.capabilities?.experience?.compliance?.trackingMode ||
      'none';

    // Validate required PERM fields based on the form's explicit settings
    if (form.capabilities?.experience?.compliance?.requireNodeId && !submissionBody.nodeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        '"nodeId" is required for this PERM-enabled form'
      );
    }

    if (form.capabilities?.experience?.compliance?.requireMonth && !submissionBody.month) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        '"month" is required for this PERM-enabled form — please select a reporting month before submitting'
      );
    }

    // For daily/weekly tracking, a specific event date is required.
    if (
      (trackingMode === 'daily' || trackingMode === 'weekly') &&
      !submissionBody.event_date &&
      !submissionBody.submission_date
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        '"event_date" is required for date-tracked PERM submissions'
      );
    }

    // ── Compliance window check ───────────────────────────────────────────
    // Only enforced when the form requires a month AND a nodeId is present,
    // meaning we have a fully-keyed compliance row to check against.
    if (submissionBody.month && submissionBody.nodeId) {
      try {
        const lockedStatus = await eventComplianceService.isMonthLocked(
          submissionBody.tenantId,
          submissionBody.projectId,
          submissionBody.nodeId,
          submissionBody.month
        );

        // lockedStatus === null  → no compliance row yet (fresh module) → allow
        // lockedStatus === false → row exists, not locked               → allow
        // lockedStatus === true  → row exists and locked                → reject
        if (lockedStatus === true) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `The submission window for ${submissionBody.month} is closed. This period has been locked.`
          );
        }

        // If compliance rows DO exist, also verify the selected month is in
        // the allowed list (not just any arbitrary past month).
        if (lockedStatus === false) {
          const { allowedDates, hasComplianceData } =
            await eventComplianceService.getAllowedMonths(
              submissionBody.tenantId,
              submissionBody.projectId,
              submissionBody.nodeId
            );

          if (hasComplianceData && !allowedDates.includes(submissionBody.month)) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Selected month (${submissionBody.month}) is not in the compliance-approved window for this module. Allowed months: ${allowedDates.join(', ')}`
            );
          }
        }
      } catch (error) {
        if (error.statusCode) throw error;
        // DB or unexpected error: log but don't block the submission
        logger.warn('Compliance window check failed — skipping:', error.message);
      }
    }

    // Validate calendar lock when calendarRequired is set
    if (
      form.capabilities?.experience?.compliance?.calendarRequired &&
      submissionBody.month
    ) {
      try {
        const calendar = await eventCalendarService.getCalendar(
          submissionBody.tenantId,
          submissionBody.projectId,
          submissionBody.month
        );

        if (!calendar || calendar.length === 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Calendar template must be created before submissions. Please contact your administrator.'
          );
        }
      } catch (error) {
        if (error.statusCode === httpStatus.BAD_REQUEST) throw error;
        // eslint-disable-next-line no-console
        console.warn('Calendar check warning:', error.message);
      }
    }
  }

  // Queue submission (worker handles routing)
  const result = await queueSubmission(submissionBody);

  // Log activity with submitter blueprint
  await logActivity({
    tenant_id: submissionBody.tenantId,
    project_id: submissionBody.projectId,
    project_name: submissionBody.project_name,
    project_category: submissionBody.project_category,
    form_id: submissionBody.formId,
    node_id: submissionBody.nodeId,
    user_id: submissionBody.userId,
    action: 'queued',
    status: 'queued',
    job_id: result.jobId,
    message: isPERM
      ? `PERM submission queued for ${submissionBody.month}`
      : 'Submission queued for processing',
    source: submissionBody.source,
    // Submitter Blueprint (from submission payload)
    user_name: submissionBody.user_name,
    user_email: submissionBody.user_email,
    user_phone: submissionBody.user_phone,
    node_name: submissionBody.node_name,
    node_reference: submissionBody.node_reference,
    form_reference: submissionBody.form_reference,
  });

  // Return unified response
  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: 'Submission queued for processing',
    jobId: result.jobId,
    status: result.status,
    type: isPERM ? 'perm' : 'regular',
    ...(isPERM && {
      month: submissionBody.month,
      nodeId: submissionBody.nodeId,
    }),
  });
});

/**
 * Retry a failed submission
 * @route POST /v1/submissions/:id/retry
 */
const retrySubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuidId = uuidV4Regex.test(id);

  // ── Path A: regular retry by submission UUID (existing behavior) ─────────
  if (isUuidId) {
    const submission = await SubmissionModel.getSubmissionById(id);

    if (!submission) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (submission.status !== 'failed') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Only failed submissions can be retried'
      );
    }

    // Re-queue with a fresh retry idempotency key so BullMQ does not reuse
    // an exhausted failed job id.
    const retryStamp = Date.now();
    const retryKey = `retry-${id}-${retryStamp}`;
    const submissionBody = {
      tenantId: submission.tenant_id,
      projectId: submission.project_id,
      project_name: submission.project_name,
      project_category: submission.project_category,
      formId: submission.form_id,
      nodeId: submission.node_id,
      userId: submission.user_id,
      payload: submission.data,
      source: submission.source,
      perm_enabled: submission.perm_enabled,
      month: submission.month,
      year: submission.year,
      event_date: submission.event_date,
      submission_date: submission.submission_date,
      idempotency_key: retryKey,
      meta: {
        ...(submission.meta || {}),
        retry_of_submission_id: id,
        original_idempotency_key: submission.idempotency_key || null,
        retried_at: new Date().toISOString(),
      },
    };

    const result = await queueSubmission(submissionBody);

    // Log retry activity
    await logActivity({
      tenant_id: submission.tenant_id,
      project_id: submission.project_id,
      project_name: submission.project_name,
      project_category: submission.project_category,
      form_id: submission.form_id,
      node_id: submission.node_id,
      user_id: submission.user_id,
      action: 'retried',
      status: 'queued',
      job_id: result.jobId,
      message: `Retrying failed submission ${id}`,
    });

    return res.send({
      success: true,
      message: 'Submission retried successfully',
      jobId: result.jobId,
      retriedSubmissionId: id,
    });
  }

  // ── Path B: retry by failed job ID hash (log-dashboard compatibility) ────
  // Some failed jobs never persisted to form_submissions (e.g. validation failure
  // before insert), so we recover original payload from dead_letter_queue.
  const { rows: dlqRows } = await postgresPool.query(
    `
      SELECT *
      FROM dead_letter_queue
      WHERE job_id = $1
      ORDER BY failed_at DESC
      LIMIT 1
    `,
    [id]
  );

  if (!dlqRows.length) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Failed job not found in DLQ. Retry requires a submission UUID or a DLQ-backed job ID.'
    );
  }

  const dlqRecord = dlqRows[0];
  const jobData =
    typeof dlqRecord.job_data === 'string'
      ? JSON.parse(dlqRecord.job_data)
      : dlqRecord.job_data;

  if (!jobData || typeof jobData !== 'object') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'DLQ record has invalid job payload; cannot retry this job'
    );
  }

  const retryStamp = Date.now();
  const retryKey = `retry-${id}-${retryStamp}`;
  const retryJobData = {
    ...jobData,
    idempotency_key: retryKey,
    meta: {
      ...(jobData.meta || {}),
      retry_of_job_id: id,
      original_idempotency_key: jobData.idempotency_key || null,
      retried_at: new Date().toISOString(),
    },
  };

  const result = await queueSubmission(retryJobData);

  await logActivity({
    tenant_id:
      retryJobData.tenantId || dlqRecord.tenant_id || req.user?.tenantId,
    project_id: retryJobData.projectId || dlqRecord.project_id || null,
    project_name: retryJobData.project_name || null,
    project_category: retryJobData.project_category || null,
    form_id: retryJobData.formId || null,
    node_id: retryJobData.nodeId || null,
    user_id: retryJobData.userId || req.user?._id || null,
    action: 'retried',
    status: 'queued',
    job_id: result.jobId,
    message: `Retrying failed job ${id} from DLQ`,
    source: retryJobData.source || 'api',
    user_name: retryJobData.user_name,
    user_email: retryJobData.user_email,
    user_phone: retryJobData.user_phone,
    node_name: retryJobData.node_name,
    node_reference: retryJobData.node_reference,
    form_reference: retryJobData.form_reference,
  });

  return res.send({
    success: true,
    message: 'Failed job retried successfully',
    jobId: result.jobId,
    retriedJobId: id,
  });
});

function formatFieldLabel(key = '') {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildStructuredPayload(rawStructured) {
  if (!rawStructured || typeof rawStructured !== 'object') {
    return { fields: [], flat: {} };
  }

  const entries = Object.entries(rawStructured).map(([key, detail]) => {
    const base = {
      key,
      label: formatFieldLabel(key),
      type: Array.isArray(detail) ? 'array' : typeof detail,
      value: detail,
      elementId: null,
      meta: {},
    };

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const {
        value,
        label,
        type,
        elementId,
        step,
        options,
        description,
        ...rest
      } = detail;

      base.label = label || base.label;
      base.type = type || base.type;
      base.value = value !== undefined ? value : detail;
      base.elementId = elementId || null;
      base.meta = {
        step: typeof step === 'number' ? step : undefined,
        options,
        description,
        raw: detail,
        ...rest,
      };
    }

    return base;
  });

  entries.sort((a, b) => {
    const stepA = a.meta?.step ?? Number.MAX_SAFE_INTEGER;
    const stepB = b.meta?.step ?? Number.MAX_SAFE_INTEGER;
    if (stepA === stepB) {
      return a.label.localeCompare(b.label);
    }
    return stepA - stepB;
  });

  const flat = entries.reduce((acc, entry) => {
    acc[entry.key] = entry.value;
    return acc;
  }, {});

  return { fields: entries, flat };
}

async function resolveNodeMetadata(submissions = []) {
  const nodeIds = submissions
    .map((submission) => submission.node_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  if (nodeIds.length === 0) {
    return new Map();
  }
  const uniqueIds = [...new Set(nodeIds)];
  const visited = new Set();
  const nodeMap = new Map();
  const queue = uniqueIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const pendingSet = new Set(queue);

  while (queue.length) {
    const batchIds = queue.splice(0, 50);
    const objectIds = batchIds.map((id) => new mongoose.Types.ObjectId(id));
    // eslint-disable-next-line no-await-in-loop
    const documents = await Nodes.find({ _id: { $in: objectIds } })
      .populate('level', 'name')
      .populate('structure', 'name')
      .lean({ virtuals: false });

    documents.forEach((doc) => {
      const docId = doc._id.toString();
      if (!nodeMap.has(docId)) {
        nodeMap.set(docId, doc);
      }
    });

    documents.forEach((doc) => {
      const identity = Array.isArray(doc.identity) ? doc.identity : [];
      identity.forEach((parent) => {
        const parentId = parent.toString();
        if (
          mongoose.Types.ObjectId.isValid(parentId) &&
          !visited.has(parentId) &&
          !nodeMap.has(parentId) &&
          !pendingSet.has(parentId)
        ) {
          queue.push(parentId);
          pendingSet.add(parentId);
        }
      });
    });

    batchIds.forEach((id) => {
      visited.add(id);
      pendingSet.delete(id);
    });
  }

  return nodeMap;
}

const maskAccountNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length <= 4 ? `••••${digits}` : `••••${digits.slice(-4)}`;
};

const sanitizeSettlementAccount = (account = {}) => {
  const source = asObject(account);
  if (!Object.keys(source).length) return null;
  return {
    bankName: source.bankName || null,
    accountName: source.accountName || null,
    accountNumber: maskAccountNumber(source.accountNumber),
  };
};

const sanitizePaymentSummary = (payment) => {
  if (!payment) return null;
  return {
    id: String(payment._id || payment.id || ''),
    reference: payment.reference || null,
    status: payment.status || null,
    amount: payment.amount ?? null,
    total: payment.total ?? null,
    currency: payment.currency || null,
    paymentMethod: payment.paymentMethod || null,
    providerRef: payment.providerRef || null,
    completedAt: payment.completedAt || null,
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null,
  };
};

const sanitizeSettlementSummary = (settlement) => {
  if (!settlement) return null;
  return {
    id: String(settlement._id || settlement.id || ''),
    paymentReference: settlement.paymentReference || null,
    status: settlement.status || null,
    availabilityStatus: settlement.availabilityStatus || null,
    fundingStatus: settlement.fundingStatus || null,
    guardrailStatus: settlement.guardrailStatus || null,
    guardrailReason: settlement.guardrailReason || null,
    provider: settlement.provider || null,
    currency: settlement.currency || null,
    amount: settlement.amount ?? null,
    netAmount: settlement.netAmount ?? null,
    destinationType: settlement.destinationType || null,
    destinationNodeId: settlement.destinationNodeId || null,
    destinationNodeReference: settlement.destinationNodeReference || null,
    destinationNodeName: settlement.destinationNodeName || null,
    sourceNodeId: settlement.sourceNodeId || null,
    sourceNodeReference: settlement.sourceNodeReference || null,
    sourceNodeName: settlement.sourceNodeName || null,
    targetLevelId: settlement.targetLevelId || null,
    destinationAccount: sanitizeSettlementAccount(settlement.destinationAccount),
    providerSettlementId: settlement.providerSettlementId || null,
    providerSettledAt: settlement.providerSettledAt || null,
    providerTransferId: settlement.providerTransferId || null,
    attempts: settlement.attempts ?? 0,
    failureReason: settlement.failureReason || null,
    createdAt: settlement.createdAt || null,
    updatedAt: settlement.updatedAt || null,
  };
};

const getSubmissionPaymentLookup = (submission) => {
  const meta = asObject(submission?.meta);
  const transaction = asObject(meta.transaction);
  const refs = [
    transaction.paymentIntentReference,
    transaction.paymentReference,
    transaction.reference,
    meta.paymentIntentReference,
    meta.paymentReference,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const ids = [transaction.paymentIntentId, transaction.paymentId, meta.paymentIntentId, meta.paymentId]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  return { refs, ids };
};

async function resolvePaymentSettlementMetadata(submissions = []) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return new Map();
  }

  const tenantIds = [
    ...new Set(
      submissions
        .map((submission) => String(submission.tenant_id || '').trim())
        .filter(Boolean)
    ),
  ];
  const submissionIds = submissions
    .map((submission) => String(submission.id || '').trim())
    .filter(Boolean);
  const referenceSet = new Set();
  const paymentIdSet = new Set();

  submissions.forEach((submission) => {
    const lookup = getSubmissionPaymentLookup(submission);
    lookup.refs.forEach((entry) => referenceSet.add(entry));
    lookup.ids.forEach((entry) => paymentIdSet.add(entry));
  });

  const paymentOr = [];
  if (submissionIds.length) {
    paymentOr.push({ submissionId: { $in: submissionIds } });
    paymentOr.push({ 'metadata.submissionDraftId': { $in: submissionIds } });
  }
  if (referenceSet.size) {
    paymentOr.push({ reference: { $in: [...referenceSet] } });
  }
  const validPaymentObjectIds = [...paymentIdSet].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validPaymentObjectIds.length) {
    paymentOr.push({
      _id: {
        $in: validPaymentObjectIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    });
  }

  if (!paymentOr.length) {
    return new Map();
  }

  const paymentQuery = { $or: paymentOr };
  if (tenantIds.length) {
    paymentQuery.tenantId = { $in: tenantIds };
  }

  const payments = await Payment.find(paymentQuery)
    .select(
      '_id tenantId reference status amount total currency paymentMethod providerRef submissionId completedAt createdAt updatedAt metadata.submissionDraftId'
    )
    .lean();

  payments.forEach((payment) => {
    if (payment.reference) referenceSet.add(String(payment.reference));
    if (payment._id) paymentIdSet.add(String(payment._id));
  });

  const settlementOr = [];
  if (referenceSet.size) {
    settlementOr.push({ paymentReference: { $in: [...referenceSet] } });
  }
  if (submissionIds.length) {
    settlementOr.push({ submissionId: { $in: submissionIds } });
  }
  const settlementPaymentObjectIds = [...paymentIdSet].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (settlementPaymentObjectIds.length) {
    settlementOr.push({
      paymentId: {
        $in: settlementPaymentObjectIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    });
  }

  const settlementQuery = settlementOr.length ? { $or: settlementOr } : null;
  if (settlementQuery && tenantIds.length) {
    settlementQuery.tenantId = { $in: tenantIds };
  }

  const settlements = settlementQuery
    ? await PaymentSettlement.find(settlementQuery)
        .select(
          '_id tenantId paymentId paymentReference submissionId provider currency amount netAmount status availabilityStatus fundingStatus guardrailStatus guardrailReason destinationType destinationNodeId destinationNodeReference destinationNodeName sourceNodeId sourceNodeReference sourceNodeName targetLevelId destinationAccount providerSettlementId providerSettledAt providerTransferId attempts failureReason createdAt updatedAt'
        )
        .lean()
    : [];

  const paymentByReference = new Map();
  const paymentById = new Map();
  const paymentBySubmissionId = new Map();
  payments.forEach((payment) => {
    if (payment.reference) paymentByReference.set(String(payment.reference), payment);
    if (payment._id) paymentById.set(String(payment._id), payment);
    if (payment.submissionId) paymentBySubmissionId.set(String(payment.submissionId), payment);
    if (payment.metadata?.submissionDraftId) {
      paymentBySubmissionId.set(String(payment.metadata.submissionDraftId), payment);
    }
  });

  const settlementByReference = new Map();
  const settlementByPaymentId = new Map();
  const settlementBySubmissionId = new Map();
  settlements.forEach((settlement) => {
    if (settlement.paymentReference) {
      settlementByReference.set(String(settlement.paymentReference), settlement);
    }
    if (settlement.paymentId) {
      settlementByPaymentId.set(String(settlement.paymentId), settlement);
    }
    if (settlement.submissionId) {
      settlementBySubmissionId.set(String(settlement.submissionId), settlement);
    }
  });

  const result = new Map();
  submissions.forEach((submission) => {
    const submissionId = String(submission.id || '');
    const lookup = getSubmissionPaymentLookup(submission);
    const payment =
      lookup.refs.map((ref) => paymentByReference.get(ref)).find(Boolean) ||
      lookup.ids.map((id) => paymentById.get(id)).find(Boolean) ||
      paymentBySubmissionId.get(submissionId) ||
      null;
    const settlement =
      (payment?.reference ? settlementByReference.get(String(payment.reference)) : null) ||
      (payment?._id ? settlementByPaymentId.get(String(payment._id)) : null) ||
      lookup.refs.map((ref) => settlementByReference.get(ref)).find(Boolean) ||
      settlementBySubmissionId.get(submissionId) ||
      null;

    if (payment || settlement) {
      result.set(submissionId, {
        payment: sanitizePaymentSummary(payment),
        settlement: sanitizeSettlementSummary(settlement),
      });
    }
  });

  return result;
}

function buildNodeHierarchyPayload(nodeDoc, nodeMap) {
  if (!nodeDoc) {
    return null;
  }

  const hierarchyEntries = nodeDoc.hierarchy || {};
  const chainIds = [
    ...(Array.isArray(nodeDoc.identity)
      ? nodeDoc.identity.map((id) => id.toString())
      : []),
    nodeDoc._id.toString(),
  ];

  const breadcrumbs = chainIds
    .map((id) => {
      const doc = nodeMap.get(id);
      if (!doc) {
        return null;
      }
      return {
        id: doc._id.toString(),
        nodeId: doc.nodeId,
        name: doc.name,
        level: doc.level && doc.level.name ? doc.level.name : null,
      };
    })
    .filter(Boolean);

  const hierarchyLabels = Object.entries(hierarchyEntries).reduce(
    (acc, [levelKey, value]) => {
      const key = value?.toString ? value.toString() : String(value);
      const doc = nodeMap.get(key);
      if (doc) {
        acc[levelKey] = {
          id: doc._id.toString(),
          nodeId: doc.nodeId,
          name: doc.name,
          level: doc.level && doc.level.name ? doc.level.name : null,
        };
      }
      return acc;
    },
    {}
  );

  return {
    id: nodeDoc._id.toString(),
    nodeId: nodeDoc.nodeId,
    name: nodeDoc.name,
    level: nodeDoc.level && nodeDoc.level.name ? nodeDoc.level.name : null,
    structure:
      nodeDoc.structure && nodeDoc.structure.name
        ? nodeDoc.structure.name
        : null,
    isMain: !!nodeDoc.isMain,
    path: nodeDoc.path,
    hierarchy: hierarchyEntries,
    hierarchyLabels,
    breadcrumbs,
  };
}

function decorateSubmissionWithStructuredData(submission, nodeMap) {
  const structuredSource =
    submission?.data?.structured || submission?.payload?.structured || null;
  let { fields, flat } = buildStructuredPayload(structuredSource);

  if (
    fields.length === 0 &&
    submission?.data &&
    typeof submission.data === 'object'
  ) {
    const fallback = { ...submission.data };
    delete fallback.structured;
    const payload = buildStructuredPayload(fallback);
    if (payload.fields.length) {
      fields = payload.fields;
      flat = payload.flat;
    }
  }

  const nodeDoc = submission.node_id ? nodeMap.get(submission.node_id) : null;

  return {
    ...submission,
    structured_fields: fields,
    structured_flat: flat,
    node_hierarchy: buildNodeHierarchyPayload(nodeDoc, nodeMap),
  };
}

function buildSubmissionSummary(submissions = []) {
  const numericTotals = {};
  const booleanBreakdown = {};
  let latestTimestamp = null;

  submissions.forEach((submission) => {
    const flat = submission.structured_flat || {};
    Object.entries(flat).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        numericTotals[key] = (numericTotals[key] || 0) + value;
      } else if (typeof value === 'boolean') {
        if (!booleanBreakdown[key]) {
          booleanBreakdown[key] = { true: 0, false: 0 };
        }
        booleanBreakdown[key][value ? 'true' : 'false'] += 1;
      }
    });

    const createdAt = submission.created_at || submission.createdAt;
    if (createdAt) {
      const timestamp = new Date(createdAt);
      if (!Number.isNaN(timestamp.getTime())) {
        if (!latestTimestamp || timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
        }
      }
    }
  });

  return {
    total_submissions: submissions.length,
    numeric_totals: numericTotals,
    boolean_breakdown: booleanBreakdown,
    latest_submission_at: latestTimestamp
      ? latestTimestamp.toISOString()
      : null,
  };
}
/**
 * Get activity logs with filtering
 * @route GET /v1/submissions/activity-log
 */
const getActivityLogs = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenantId',
    'projectId',
    'formId',
    'userId',
    'status',
    'search',
    'limit',
    'offset',
  ]);

  if (filters.limit) filters.limit = parseInt(filters.limit, 10);
  if (filters.offset) filters.offset = parseInt(filters.offset, 10);

  // Enforce tenant isolation by default.
  // Only Saby users can view cross-tenant activity logs.
  if (!req.user?.isSaby) {
    filters.tenantId = req.user?.tenantId;
  }

  const { results, total } = await getActivityLogsService(filters);

  // Debug: Log first result to see what fields we're returning
  if (results.length > 0) {
    logger.debug('[ActivityLogs] Returning sample activity log payload', {
      sample: results[0],
      total,
    });
  }

  // Set cache-control headers to prevent browser caching
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });

  res.send({
    success: true,
    results,
    total,
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });
});

/**
 * Get activity log summary
 * @route GET /v1/submissions/activity-log/summary
 */
const getActivityLogSummary = catchAsync(async (req, res) => {
  const filters = {};
  if (!req.user?.isSaby) {
    filters.tenantId = req.user?.tenantId;
  }

  const summary = await getActivityLogSummaryService(filters);

  res.send({
    success: true,
    summary,
  });
});

/**
 * Get enhanced activity logs with user names, node codes, and form references
 * @route GET /v1/submissions/activity-log/enhanced
 */
const getEnhancedActivityLogs = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenantId',
    'projectId',
    'formId',
    'userId',
    'status',
    'search',
    'limit',
    'offset',
  ]);

  if (filters.limit) filters.limit = parseInt(filters.limit, 10);
  if (filters.offset) filters.offset = parseInt(filters.offset, 10);

  // Enforce tenant isolation by default.
  // Only Saby users can view cross-tenant activity logs.
  if (!req.user?.isSaby) {
    filters.tenantId = req.user?.tenantId;
  }

  const { results, total } = await getEnhancedActivityLogsService(filters);

  res.send({
    success: true,
    results,
    total,
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });
});

/**
 * List submissions with filtering
 * @route GET /v1/submissions
 */
const listSubmissions = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'nodeId',
    'user_id',
    'status',
    'source',
    'perm_enabled',
    'month',
    'start_date',
    'end_date',
    'search',
    'limit',
    'offset',
    'include_payload',
  ]);

  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  // Allow client-side nodeId (reference) as canonical filter key.
  if (!filters.node_id && filters.nodeId) {
    filters.node_id = filters.nodeId;
  }

  if (filters.limit) {
    filters.limit = parseInt(filters.limit, 10);
  }
  if (filters.offset) {
    filters.offset = parseInt(filters.offset, 10);
  }

  logger.info('[listSubmissions] Fetching submissions', {
    filters,
    userTenant: req.user?.tenantId,
  });

  const submissions = await listSubmissionsService(filters);

  logger.info(`[listSubmissions] Retrieved ${submissions.length} submissions`);

  const [nodeMetadata, paymentSettlementMetadata] = await Promise.all([
    resolveNodeMetadata(submissions),
    resolvePaymentSettlementMetadata(submissions),
  ]);
  const enrichedSubmissions = submissions.map((submission) =>
    ({
      ...decorateSubmissionWithStructuredData(submission, nodeMetadata),
      paymentSettlement: paymentSettlementMetadata.get(String(submission.id || '')) || null,
    })
  );
  const summary = buildSubmissionSummary(enrichedSubmissions);

  res.send({
    success: true,
    results: enrichedSubmissions,
    count: enrichedSubmissions.length,
    summary,
  });
});

/**
 * Get submission by ID
 * @route GET /v1/submissions/:id
 */
const getSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const submission = await SubmissionModel.getSubmissionById(id);

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  res.send({
    success: true,
    submission,
  });
});

/**
 * Get activity logs by user
 * @route GET /v1/submissions/activity-log/user/:user_id
 */
const getActivityLogsByUser = catchAsync(async (req, res) => {
  const { user_id } = req.params;
  const { tenant_id, limit, offset } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getActivityLogsByUser(
    user_id,
    tenant_id,
    parseInt(limit, 10) || 100,
    parseInt(offset, 10) || 0
  );

  const count = await ActivityLogModel.getActivityLogsCount({
    tenant_id,
    user_id,
  });

  res.send({
    success: true,
    data: logs,
    count,
    total: count,
  });
});

/**
 * Get activity logs by action
 * @route GET /v1/submissions/activity-log/action/:action
 */
const getActivityLogsByAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const { tenant_id, limit, offset } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getActivityLogsByAction(
    action,
    tenant_id,
    parseInt(limit, 10) || 100,
    parseInt(offset, 10) || 0
  );

  const count = await ActivityLogModel.getActivityLogsCount({
    tenant_id,
    action,
  });

  res.send({
    success: true,
    data: logs,
    count,
    total: count,
  });
});

/**
 * Get activity logs by job ID
 * @route GET /v1/submissions/activity-log/job/:job_id
 */
const getActivityLogsByJobId = catchAsync(async (req, res) => {
  const { job_id } = req.params;

  const logs = await ActivityLogModel.getActivityLogsByJobId(job_id);

  res.send({
    success: true,
    data: logs,
    count: logs.length,
  });
});

/**
 * Get recent activity logs
 * @route GET /v1/submissions/activity-log/recent
 */
const getRecentActivityLogs = catchAsync(async (req, res) => {
  const { tenant_id, limit } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getRecentActivityLogs(
    tenant_id,
    parseInt(limit, 10) || 50
  );

  res.send({
    success: true,
    data: logs,
    count: logs.length,
  });
});

/**
 * Update activity log status
 * @route PATCH /v1/submissions/activity-log/:id
 */
const updateActivityLogStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, message } = req.body;

  if (!status) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'status is required',
    });
  }

  const log = await ActivityLogModel.updateActivityLogStatus(
    id,
    status,
    message
  );

  if (!log) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Activity log not found',
    });
  }

  res.send({
    success: true,
    message: 'Activity log updated',
    data: log,
  });
});

/**
 * Delete activity log
 * @route DELETE /v1/submissions/activity-log/:id
 */
const deleteActivityLog = catchAsync(async (req, res) => {
  const { id } = req.params;

  const log = await ActivityLogModel.deleteActivityLog(id);

  if (!log) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Activity log not found',
    });
  }

  res.send({
    success: true,
    message: 'Activity log deleted',
    data: log,
  });
});

/**
 * Bulk delete activity logs
 * @route POST /v1/submissions/activity-log/bulk-delete
 */
const bulkDeleteActivityLogs = catchAsync(async (req, res) => {
  const filters = pick(req.body, [
    'tenant_id',
    'project_id',
    'older_than_days',
    'status',
  ]);

  if (!filters.tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const deletedCount = await ActivityLogModel.bulkDeleteActivityLogs(filters);

  res.send({
    success: true,
    message: `Deleted ${deletedCount} activity logs`,
    deleted: deletedCount,
  });
});

/**
 * Update submission - queues the update for async processing
 */
const updateSubmission = catchAsync(async (req, res) => {
  const { id: submissionId } = req.params;
  const { data, payload, status, meta, force } = req.body;
  const userId = req.user?._id;
  const tenantId = req.user?.tenantId;

  // Quick validation - check if submission exists
  const existing = await SubmissionModel.getSubmissionById(submissionId);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  if (existing.tenant_id !== tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Not authorized to access this submission'
    );
  }

  // Permission check - user must own the submission or be admin/sabyUser
  const canEdit =
    req.user?.role === 'admin' ||
    req.user?.role === 'sabyUser' ||
    req.user?.isOwner === true ||
    req.user?.isSuper === true ||
    req.user?.isAdmin === true ||
    req.user?.isSaby === true ||
    existing.user_id === userId?.toString()

  if (!canEdit) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Not authorized to update this submission'
    );
  }

  // ── Lock guard ─────────────────────────────────────────────────────────
  // A submission becomes locked when its compliance period is closed
  // (is_locked set by monthEndProcessor or via admin action).
  // Regular users are blocked entirely.
  // Admin / sabyUser can override by passing `force: true` in the body.
  if (existing.is_locked === true || existing.is_locked === 'true') {
    const isPrivileged =
      req.user?.role === 'admin' ||
      req.user?.role === 'sabyUser' ||
      req.user?.isOwner === true ||
      req.user?.isSuper === true ||
      req.user?.isAdmin === true ||
      req.user?.isSaby === true;

    if (!isPrivileged || !force) {
      throw new ApiError(
        httpStatus.LOCKED,   // 423
        isPrivileged
          ? 'Submission period is locked. Send `force: true` to override.'
          : 'Submission period is locked and cannot be edited. Contact an administrator.'
      );
    }

    // Privileged + force — log the override
    logger.warn(
      `[updateSubmission] Admin override on locked submission ${submissionId} by user ${userId}`
    );
  }

  // Queue the update for async processing
  const result = await queueUpdateSubmission({
    submissionId,
    updates: { data, payload, status, meta },
    userId,
    tenantId,
    force: !!force,
    actorRole: req.user?.role,
  });

  const normalizedStatus = (status || '').toLowerCase().trim();
  if (normalizedStatus) {
    const statusToActionType = {
      approved: 'approve_submission',
      rejected: 'reject_submission',
      reopened: 'reopen_submission',
      reopen: 'reopen_submission',
    };

    const actionType = statusToActionType[normalizedStatus];
    if (actionType) {
      await copilotActionService.recordExistingAction({
        tenantId,
        actorUserId: userId,
        actionType,
        entityType: 'submission',
        entityId: submissionId,
        payload: {
          source: 'unifiedSubmission.controller.updateSubmission',
          requestedStatus: status,
          jobId: result.jobId,
        },
        source: 'existing-service',
        priority: normalizedStatus === 'rejected' ? 9 : 7,
      });
    }
  }

  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: 'Submission update queued for processing',
    jobId: result.jobId,
    status: result.status,
  });
});

/**
 * Delete submission - queues the delete for async processing
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { id: submissionId } = req.params;
  const { permanent } = req.body;
  const userId = req.user?._id;
  const tenantId = req.user?.tenantId;

  // Quick validation - check if submission exists
  const existing = await SubmissionModel.getSubmissionById(submissionId);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  if (existing.tenant_id !== tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Not authorized to access this submission'
    );
  }
  // Permission check
  const canDelete =
    req.user?.role === 'admin' ||
    req.user?.role === 'sabyUser' ||
    req.user?.isOwner === true ||
    req.user?.isSuper === true ||
    req.user?.isAdmin === true ||
    req.user?.isSaby === true ||
    existing.user_id === userId?.toString();

  if (!canDelete) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Not authorized to delete this submission'
    );
  }

  // Locked submissions cannot be deleted unless privileged override policy is introduced.
  if (existing.is_locked === true || existing.is_locked === 'true') {
    throw new ApiError(
      httpStatus.LOCKED,
      'Submission period is locked and this submission cannot be deleted.'
    );
  }

  // Permanent delete requires admin/sabyUser
  if (
    permanent &&
    req.user?.role !== 'sabyUser' &&
    req.user?.role !== 'admin'
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Permanent deletion requires admin role'
    );
  }

  // Queue the delete for async processing
  const result = await queueDeleteSubmission({
    submissionId,
    userId,
    tenantId,
    permanent: permanent || false,
  });

  await copilotActionService.recordExistingAction({
    tenantId,
    actorUserId: userId,
    actionType: permanent ? 'delete_submission' : 'withdraw_submission',
    entityType: 'submission',
    entityId: submissionId,
    payload: {
      source: 'unifiedSubmission.controller.deleteSubmission',
      permanent: !!permanent,
      jobId: result.jobId,
    },
    source: 'existing-service',
    priority: permanent ? 10 : 8,
  });

  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: permanent
      ? 'Submission permanently deleted'
      : 'Submission queued for deletion (soft delete)',
    jobId: result.jobId,
    status: result.status,
  });
});

/**
 * Bulk delete submissions and activity logs by job IDs
 * @route POST /v1/submissions/bulk-delete-by-jobs
 */
const bulkDeleteByJobIds = catchAsync(async (req, res) => {
  const { jobIds } = req.body;

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Job IDs array is required');
  }

  // Delete from form_submissions
  const submissionsResult = await postgresPool.query(
    'DELETE FROM form_submissions WHERE job_id = ANY($1) RETURNING id',
    [jobIds]
  );

  // Delete from activity logs
  const logsResult = await postgresPool.query(
    'DELETE FROM submission_activity_log WHERE job_id = ANY($1) RETURNING id',
    [jobIds]
  );

  logger.info(
    `🗑️ Bulk delete: ${submissionsResult.rowCount} submissions, ${logsResult.rowCount} activity logs`
  );

  res.send({
    success: true,
    deleted: {
      submissions: submissionsResult.rowCount,
      activityLogs: logsResult.rowCount,
    },
  });
});

/**
 * Clean up test data (for test bed simulator)
 * @route DELETE /v1/submissions/cleanup-test-data
 */
const cleanupTestData = catchAsync(async (req, res) => {
  const {
    tenantId,
    source,
    projectId,
    deleteFormData = true,
    deleteCalendar = false,
  } = req.body;

  if (!tenantId || !source) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and source required');
  }

  if (!source.startsWith('test-') && !source.startsWith('saby-simulator')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Can only cleanup test data (source must start with test- or saby-simulator)'
    );
  }

  const deletedCounts = { submissions: 0, activityLogs: 0, calendars: 0 };

  const conditions = [];
  const values = [];
  let idx = 1;

  conditions.push(`tenant_id = $${idx}`);
  values.push(tenantId);
  idx += 1;

  conditions.push(`source = $${idx}`);
  values.push(source);
  idx += 1;

  if (projectId) {
    conditions.push(`project_id = $${idx}`);
    values.push(projectId);
    idx += 1;
  }

  const whereClause = conditions.join(' AND ');

  // Delete form submissions
  if (deleteFormData) {
    const submissionsResult = await postgresPool.query(
      `DELETE FROM form_submissions WHERE ${whereClause} RETURNING id`,
      values
    );
    deletedCounts.submissions = submissionsResult.rowCount;
  }

  // Delete activity logs
  const logsResult = await postgresPool.query(
    `DELETE FROM submission_activity_log WHERE ${whereClause} RETURNING id`,
    values
  );
  deletedCounts.activityLogs = logsResult.rowCount;

  // Delete calendars if requested
  if (deleteCalendar && projectId) {
    const calResult = await postgresPool.query(
      'DELETE FROM event_calendar WHERE project_id = $1 RETURNING id',
      [projectId]
    );
    deletedCounts.calendars = calResult.rowCount;
  }

  logger.info(`🗑️ Test data cleanup: ${JSON.stringify(deletedCounts)}`);

  res.send({
    success: true,
    message: 'Test data cleaned successfully',
    deleted: deletedCounts,
  });
});

/**
 * Return the compliance-approved months for a given project + node.
 *
 * @route  GET /v1/submissions/allowed-months
 * @query  projectId  (required)
 * @query  nodeId     (required)
 *
 * Response shape:
 * {
 *   allowedDates:      ["2026-01", "2026-02"],  // YYYY-MM, unlocked
 *   lockedDates:       ["2025-12"],              // YYYY-MM, locked
 *   hasComplianceData: true,
 *   fallback:          false,
 *   message:           "2 month(s) open for submission"
 * }
 *
 * When hasComplianceData is false the compliance table has no rows for this
 * project/node yet (fresh module).  The frontend falls back to its rolling
 * N-month window in that case.
 */
const getAllowedMonths = catchAsync(async (req, res) => {
  const tenantId  = req.user?.tenantId;
  const { projectId, nodeId } = req.query;

  if (!tenantId || !projectId || !nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: projectId, nodeId'
    );
  }

  const resolvedNode = await resolveNodeIdToObjectId(tenantId, nodeId);
  const nodeObjectId = resolvedNode?.objectId || nodeId;

  const { allowedDates, lockedDates, allDates, hasComplianceData, fallback } =
    await eventComplianceService.getAllowedMonths(tenantId, projectId, nodeObjectId);

  res.status(httpStatus.OK).json({
    success: true,
    allowedDates,
    lockedDates,
    allDates,
    hasComplianceData,
    fallback,
    message: fallback
      ? 'Calendar not yet seeded — showing current year as default window'
      : allowedDates.length === 0
      ? 'No open submission periods — all months are locked'
      : `${allowedDates.length} month(s) open for submission`,
  });
});

/**
 * GET /v1/submissions/allowed-dates
 *
 * Returns every scheduled submission date for a given month, enriched with
 * how many submissions this node has already made for each date.
 *
 * For trackingMode = 'none' (month-only modules) → dates: null
 * For 'daily' / 'weekly'                         → dates: [{ date, required, submitted, remaining, isFull, isPast, dayLabel }]
 *
 * @query  projectId  (required)
 * @query  nodeId     (required)
 * @query  month      (required) "YYYY-MM"
 */
const getAllowedDatesHandler = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { projectId, nodeId, month } = req.query;

  if (!tenantId || !projectId || !nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: projectId, nodeId'
    );
  }

  const resolvedNode = await resolveNodeIdToObjectId(tenantId, nodeId);
  const nodeObjectId = resolvedNode?.objectId || nodeId;

  const {
    allowedDates: allowedMonths = [],
    lockedDates: lockedMonths = [],
    allDates: allMonths = [],
    hasComplianceData = false,
    fallback = false,
  } = await eventComplianceService.getAllowedMonths(
    tenantId,
    projectId,
    nodeObjectId
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const requestedMonth = month ? String(month).slice(0, 7) : null;
  const effectiveMonth =
    requestedMonth ||
    (allowedMonths.includes(currentMonth) ? currentMonth : null) ||
    allowedMonths[0] ||
    allMonths[0] ||
    currentMonth;

  // Normalise "YYYY-MM" -> "YYYY-MM-01" for DB
  const monthKey =
    effectiveMonth.length === 7 ? `${effectiveMonth}-01` : effectiveMonth;

  const result = await getAllowedDates({
    tenantId,
    projectId,
    nodeId: nodeObjectId,
    month: monthKey,
  });

  const isLocked = await eventComplianceService.isMonthLocked(
    tenantId,
    projectId,
    nodeObjectId,
    monthKey
  );

  const dates = Array.isArray(result.dates)
    ? result.dates.map((d) => {
        let status = 'available';
        if (isLocked === true) {
          status = 'locked';
        } else if (d.isFull) {
          status = 'full';
        } else if ((d.submitted || 0) > 0) {
          status = 'partial';
        }
        return {
          ...d,
          quota_total: d.required,
          submitted_count: d.submitted,
          remaining_count: d.remaining,
          locked: isLocked === true,
          status,
        };
      })
    : result.dates;

  res.status(httpStatus.OK).json({
    success: true,
    ...result,
    dates,
    locked: isLocked === true,
    month: String(effectiveMonth).slice(0, 7),
    requestedMonth,
    allowedMonths,
    lockedMonths,
    allMonths,
    hasComplianceData,
    fallback,
  });
});

const submitPublicDataByReference = catchAsync(async (req, res) => {
  const { reference } = req.params;
  const {
    payload,
    meta,
    nodeId,
    node_id: nodeIdAlias,
    event_date: eventDate,
    submission_date: submissionDate,
    month,
    year,
    idempotency_key: idempotencyKey,
  } = req.body;

  const resolved = await projectFormService.getPublicProjectFormByReference(
    reference
  );

  const validationResult =
    await publicSubmissionValidationService.runPublicPreSubmitPipeline({
      projectForm: resolved.projectForm,
      submissionData: payload,
      metadata: {
        ...(meta || {}),
        publicAccess: {
          reference,
        },
      },
      routeType: 'public_standard',
      actorContext: {
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      },
    });
  const projectForm = validationResult.projectForm;
  const normalizedSubmissionData = validationResult.submissionData || payload;
  const invoiceSnapshot = await projectFormInvoiceService.evaluateInvoiceSnapshot({
    projectForm,
    submissionData: normalizedSubmissionData,
    allocateNumber: true,
  });

  const submissionBody = {
    tenantId: projectForm.tenantId,
    projectId: projectForm.projectId,
    project_name: projectForm?.identity?.name || null,
    project_category: Array.isArray(projectForm?.identity?.tags)
      ? projectForm.identity.tags[0] || null
      : null,
    formId: projectForm.formId,
    nodeId: nodeId || nodeIdAlias || null,
    payload: buildFinancialSubmissionData({
      submissionData: normalizedSubmissionData,
      metadata: meta,
      invoiceSnapshot,
    }),
    source: 'public_standard_form',
    meta: {
      ...(meta || {}),
      publicAccess: {
        reference,
        canonicalRef: resolved.canonicalRef,
        resolvedBy: resolved.resolvedBy,
        shareRef: projectForm.shareRef || null,
        publicRef: projectForm.publicRef || null,
        shareCode: projectForm.shareCode || null,
        pipelineTarget: 'postgres_unified',
      },
      requestContext: {
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.get('user-agent') || null,
      },
      transaction: buildTransactionMeta(meta, invoiceSnapshot),
      anonymous: true,
    },
    event_date: eventDate,
    submission_date: submissionDate,
    month,
    year,
    idempotency_key: idempotencyKey,
  };

  const result = await queueSubmission(submissionBody);

  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: 'Public submission received and queued for processing',
    jobId: result.jobId,
    status: result.status,
    canonicalRef: resolved.canonicalRef,
  });
});


module.exports = {
  submitData,
  retrySubmission,
  submitPublicDataByReference,
  getActivityLogs,
  getActivityLogSummary,
  getEnhancedActivityLogs,
  listSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
  bulkDeleteByJobIds,
  cleanupTestData,
  getAllowedMonths,
  getAllowedDatesHandler,
  // Enhanced activity log endpoints
  getActivityLogsByUser,
  getActivityLogsByAction,
  getActivityLogsByJobId,
  getRecentActivityLogs,
  updateActivityLogStatus,
  deleteActivityLog,
  bulkDeleteActivityLogs,
};
