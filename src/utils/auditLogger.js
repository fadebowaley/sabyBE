const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

let emitAuditTrailUpdate = null;
try {
  // Lazy import to avoid startup-order issues
  // eslint-disable-next-line global-require
  emitAuditTrailUpdate = require('../config/socket').emitAuditTrailUpdate;
} catch (_) {
  // Socket.IO not loaded — skip real-time emits
}

// ---------------------------------------------------------------------------
// IP Resolution
// ---------------------------------------------------------------------------
const resolveClientIp = (req) => {
  try {
    const forwarded =
      req.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim();
    if (forwarded && /^[\d.]+$/.test(forwarded)) return forwarded;
    if (forwarded && /^[0-9a-f:]+$/i.test(forwarded)) return forwarded;

    const realIp = req.headers?.['x-real-ip'];
    if (realIp) return String(realIp).trim();

    const connIp = req.connection?.remoteAddress || req.socket?.remoteAddress;
    if (connIp && connIp !== '::1') return String(connIp).replace(/^::ffff:/, '');
  } catch (_) { /* best-effort */ }
  return null;
};

// ---------------------------------------------------------------------------
// Body Sanitization
// ---------------------------------------------------------------------------
const SENSITIVE_FIELDS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'apiKey', 'apiSecret',
  'secret', 'secretKey', 'privateKey', 'signingKey',
  'passcode', 'pin', 'otp', 'mfaCode',
]);

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key$/i,
  /apikey/i,
  /passcode/i,
  /pin$/i,
  /otp/i,
  /credential/i,
];

const REDACTED = '[REDACTED]';

const isSensitiveField = (key) => {
  const lower = String(key).toLowerCase();
  if (SENSITIVE_FIELDS.has(lower)) return true;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(lower));
};

const sanitizeBody = (body, maxDepth = 3) => {
  try {
    if (!body || typeof body !== 'object') return null;
    const raw = typeof body === 'string' ? JSON.parse(body) : body;

    const walk = (value, depth) => {
      if (depth > maxDepth) return REDACTED;
      if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
      if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = isSensitiveField(key) ? REDACTED : walk(val, depth + 1);
        }
        return sanitized;
      }
      return value;
    };

    return walk(raw, 0);
  } catch (_) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Resource & Action Inference
// ---------------------------------------------------------------------------
const PATH_SEGMENT_TO_RESOURCE = {
  auth: 'auth_session',
  'auth-sessions': 'auth_session',
  login: 'auth_session',
  logout: 'auth_session',
  mfa: 'auth_session',
  users: 'user',
  user: 'user',
  'user-form-settings': 'user_settings',
  nodes: 'node',
  node: 'node',
  levels: 'level',
  structures: 'structure',
  roles: 'role',
  permissions: 'permission',
  'project-forms': 'project_form',
  'project-form': 'project_form',
  projects: 'project',
  submissions: 'submission',
  submission: 'submission',
  storage: 'storage',
  'storage-folders': 'storage_folder',
  'inmails': 'inmail',
  payments: 'payment',
  subscriptions: 'subscription',
  'subscription-catalog': 'subscription_catalog',
  'subscription-admin': 'subscription_admin',
  copilot: 'copilot',
  'executive-intelligence': 'executive_intelligence',
  intelligence: 'executive_intelligence',
  workflows: 'workflow',
  approvals: 'approval',
  events: 'event',
  'event-config': 'event_config',
  reports: 'report',
  settings: 'settings',
  departments: 'department',
  'custom-field-config': 'custom_field_config',
  compliance: 'compliance',
  cms: 'cms_page',
  collection: 'collection',
  capture: 'capture',
  agent: 'copilot_agent',
  data: 'data',
};

const METHOD_TO_ACTION = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const LOGIN_ACTION_OVERRIDES = new Set([
  '/v1/auth/login',
  '/v1/auth/refresh-tokens',
  '/v1/auth/logout',
  '/v1/auth/mfa/login',
  '/v1/auth/forgot-password',
  '/v1/auth/reset-password',
]);

const inferResource = (path) => {
  try {
    const clean = path.split('?')[0].replace(/^\/api\/public\/forms/, '/v1/submissions');
    // For /v1/* routes, the first meaningful segment maps to a resource
    const segments = clean.split('/').filter(Boolean);

    // Special case: /v1/copilot/intelligence/... -> copilot
    // /v1/executive-intelligence/... -> executive_intelligence
    if (segments[0] === 'v1' && segments.length >= 2) {
      // Check compound: copilot/intelligence, copilot/approvals, etc.
      const compound = segments.slice(1, 3).join('/');
      if (PATH_SEGMENT_TO_RESOURCE[compound]) return PATH_SEGMENT_TO_RESOURCE[compound];

      return PATH_SEGMENT_TO_RESOURCE[segments[1]] || segments[1];
    }

    if (segments[0] && PATH_SEGMENT_TO_RESOURCE[segments[0]]) {
      return PATH_SEGMENT_TO_RESOURCE[segments[0]];
    }

    return segments[1] || segments[0] || 'unknown';
  } catch (_) {
    return 'unknown';
  }
};

const inferAction = (method, path) => {
  try {
    // Special actions
    const clean = path.split('?')[0];
    if (method === 'POST' && clean.includes('/auth/login')) return 'login';
    if (method === 'POST' && clean.includes('/auth/logout')) return 'logout';
    if (method === 'POST' && clean.includes('/auth/refresh')) return 'refresh_token';
    if (method === 'POST' && clean.includes('/auth/forgot')) return 'request_reset';
    if (method === 'POST' && clean.includes('/auth/reset-password')) return 'reset_password';
    if (method === 'POST' && clean.includes('/auth/mfa')) return 'mfa_verify';
    if (method === 'POST' && clean.includes('/export')) return 'export';
    if (method === 'POST' && method === 'POST' && clean.includes('/upload')) return 'upload';
    if (clean.includes('/download')) return 'download';
    if (clean.includes('/search')) return 'search';
    if (clean.includes('/share')) return 'share';

    return METHOD_TO_ACTION[method] || method.toLowerCase();
  } catch (_) {
    return METHOD_TO_ACTION[method] || method.toLowerCase();
  }
};

const extractResourceId = (params) => {
  try {
    if (!params || typeof params !== 'object') return null;
    const keys = Object.keys(params);
    if (keys.length === 1) return String(params[keys[0]]);
    // Prefer: projectId, formId, nodeId, userId, submissionId, settingsId
    const preferred = ['projectId', 'formId', 'nodeId', 'userId', 'submissionId', 'settingsId', 'id'];
    for (const key of preferred) {
      if (params[key]) return String(params[key]);
    }
    return null;
  } catch (_) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Path Exclusion
// ---------------------------------------------------------------------------
const EXCLUDED_PATHS = [
  /^\/api\/health/,
  /^\/api\/status/,
  /^\/api\/metrics/,
  /^\/favicon/,
  /^\/robots/,
  /^\/_next/,
  /^\/api\/manifest/,
  /^\/api\/public\/storage\/image/,
];

const isExcluded = (path) => {
  if (!path) return true;
  return EXCLUDED_PATHS.some((pattern) => pattern.test(path));
};

// ---------------------------------------------------------------------------
// Batch Queue (fire & forget)
// ---------------------------------------------------------------------------
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 100;

let queue = [];
let flushTimer = null;

const columns = [
  'tenant_id', 'user_id', 'user_name', 'user_email',
  'action', 'resource', 'resource_id',
  'method', 'path', 'status_code', 'ip_address', 'user_agent',
  'request_body', 'duration_ms', 'error_message', 'correlation_id', 'source',
];

const buildInsertSql = (batchSize) =>
  `INSERT INTO public.audit_trail (${columns.join(', ')})
   VALUES ${Array.from({ length: batchSize }, (_, i) =>
     `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
   ).join(', ')}`;

const flush = async () => {
  if (!queue.length) return;

  const batch = queue.splice(0, Math.min(queue.length, MAX_BATCH_SIZE));
  try {
    const sql = buildInsertSql(batch.length);
    const values = batch.flatMap((entry) =>
      columns.map((col) => entry[col] ?? null)
    );
    await postgresPool.query(sql, values);

    // Emit real-time updates to tenant rooms
    if (emitAuditTrailUpdate) {
      for (const entry of batch) {
        if (entry.tenant_id) {
          try { emitAuditTrailUpdate(entry.tenant_id, entry); } catch (_) { }
        }
      }
    }
  } catch (error) {
    if (error.code === '42P01') {
      // Table doesn't exist yet — migrations haven't run, silently discard
    } else {
      logger.error(`[AuditTrail] Batch insert failed: ${error.message}`);
    }
  }

  if (queue.length) {
    // Schedule another flush for remaining items
    flushTimer = setTimeout(flush, 100);
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
};

const enqueue = (entry) => {
  queue.push(entry);
  scheduleFlush();

  // Force flush if queue grows too large
  if (queue.length >= MAX_BATCH_SIZE) {
    clearTimeout(flushTimer);
    flushTimer = null;
    flush();
  }
};

// ---------------------------------------------------------------------------
// Build Entry
// ---------------------------------------------------------------------------
const buildAuditEntry = (req, res, started, opts = {}) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];

  if (opts.skip || isExcluded(path)) return null;

  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId || null;
    const tenantId = req.user?.tenantId || req.user?.tenant || null;

    // Unauthenticated requests — only log if they hit auth routes or return errors
    if (!userId && res.statusCode < 400 && !path.includes('/auth/')) return null;

    const resource = opts.resource || inferResource(path);
    const action = opts.action || inferAction(req.method, path);
    const resourceId = opts.resourceId || extractResourceId(req.params);
    const durationMs = Date.now() - started;

    const entry = {
      tenant_id: tenantId,
      user_id: userId,
      user_name: req.user
        ? [req.user.firstname || req.user.firstName, req.user.lastname || req.user.lastName]
            .filter(Boolean).join(' ') || null
        : null,
      user_email: req.user?.email || null,
      action,
      resource,
      resource_id: resourceId,
      method: req.method,
      path,
      status_code: res.statusCode,
      ip_address: resolveClientIp(req),
      user_agent: (req.headers?.['user-agent'] || '').slice(0, 512) || null,
      request_body: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? JSON.stringify(sanitizeBody(req.body) ?? null)
        : null,
      duration_ms: durationMs,
      error_message: res.statusCode >= 400 ? 'Request returned error status' : null,
      correlation_id: req.headers?.['x-correlation-id'] || req.id || null,
      source: opts.source || 'api',
    };

    return entry;
  } catch (error) {
    logger.error(`[AuditTrail] Failed to build entry: ${error.message}`);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const logAuditEntry = (req, res, started, opts) => {
  try {
    const entry = buildAuditEntry(req, res, started, opts);
    if (entry) enqueue(entry);
  } catch (_) {
    // Never throw — audit logging is best-effort
  }
};

// For explicit manual logging from within controllers/services
const logExplicit = async (entry) => {
  try {
    const values = columns.map((col) => entry[col] ?? null);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    await postgresPool.query(
      `INSERT INTO public.audit_trail (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
  } catch (error) {
    logger.error(`[AuditTrail] Explicit log failed: ${error.message}`);
  }
};

module.exports = { logAuditEntry, logExplicit };
