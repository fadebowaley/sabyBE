const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const csvParser = require('csv-parser');
const httpStatus = require('http-status');
const config = require('../config/config');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const copilotOnboardingService = require('./copilotOnboarding.service');

const ALLOWED_JOB_MODES = new Set(['dry_run', 'import']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  '57P01',
]);
const ONBOARDING_UPLOAD_ROOT = path.join(os.tmpdir(), 'saby-onboarding-jobs');
const MAX_ONBOARDING_ROWS = Math.max(
  1,
  Number(config.copilot?.onboarding?.maxRows || process.env.COPILOT_ONBOARDING_MAX_ROWS || 200000)
);

const resolveMode = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  return ALLOWED_JOB_MODES.has(raw) ? raw : 'import';
};

const normalizeLimit = (value, fallback = 20, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
};

const normalizeOffset = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 0);
};

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const keyValues = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`
  );
  return `{${keyValues.join(',')}}`;
};

const hashRequestPayload = (payload) =>
  crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const fileSha256 = (absPath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const normalizeCsvHeader = (value) => String(value || '').trim().toLowerCase();

const parseCsvFileStream = (absPath, maxRows = MAX_ONBOARDING_ROWS) =>
  new Promise((resolve, reject) => {
    let headers = [];
    let lineNumber = 1;
    const rows = [];
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const stream = fs.createReadStream(absPath);
    const parser = csvParser({
      mapHeaders: ({ header }) => normalizeCsvHeader(header),
      skipComments: false,
    });

    parser.on('headers', (incoming) => {
      headers = (incoming || []).map(normalizeCsvHeader).filter(Boolean);
    });

    parser.on('data', (rowData) => {
      if (settled) return;
      lineNumber += 1;
      const row = {};
      headers.forEach((header) => {
        row[header] = String(rowData?.[header] || '').trim();
      });
      rows.push({
        lineNumber,
        row,
      });

      if (rows.length > maxRows) {
        const error = new ApiError(
          httpStatus.BAD_REQUEST,
          `CSV row count ${rows.length} exceeds max allowed ${maxRows}`
        );
        error.code = 'CSV_ROW_LIMIT_EXCEEDED';
        fail(error);
        stream.destroy(error);
      }
    });

    parser.on('error', fail);
    stream.on('error', fail);

    parser.on('end', () => {
      if (settled) return;
      if (headers.length === 0) {
        fail(
          new ApiError(
            httpStatus.BAD_REQUEST,
            'CSV must include header and at least one data row'
          )
        );
        return;
      }
      if (rows.length === 0) {
        fail(
          new ApiError(
            httpStatus.BAD_REQUEST,
            'CSV must include header and at least one data row'
          )
        );
        return;
      }
      succeed({ headers, rows });
    });

    stream.pipe(parser);
  });

const safeDeleteUploadedFile = async (absPath) => {
  try {
    if (!absPath) return;
    const root = path.resolve(ONBOARDING_UPLOAD_ROOT);
    const resolved = path.resolve(String(absPath || ''));
    if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) return;
    if (!fs.existsSync(absPath)) return;
    await fs.promises.unlink(absPath);
  } catch {
    // Best effort cleanup.
  }
};

const isRetryableError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  if (RETRYABLE_ERROR_CODES.has(code)) return true;
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return Number.isFinite(statusCode) && statusCode >= 500 && statusCode < 600;
};

const appendOnboardingJobEvent = async ({
  tenantId,
  jobId,
  eventType,
  stage = null,
  status = null,
  progressPct = null,
  message = null,
  payload = {},
  createdBy = null,
}) => {
  await postgresPool.query(
    `INSERT INTO copilot.onboarding_job_events (
       tenant_id,
       job_id,
       event_type,
       stage,
       status,
       progress_pct,
       message,
       payload_json,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tenantId,
      jobId,
      String(eventType || 'job_update'),
      stage,
      status,
      Number.isFinite(Number(progressPct)) ? Number(progressPct) : null,
      message,
      payload || {},
      createdBy ? String(createdBy) : null,
    ]
  );
};

const updateJob = async (jobId, tenantId, patch = {}) => {
  const keys = Object.keys(patch || {});
  if (keys.length === 0) return null;

  const assignments = [];
  const values = [];
  keys.forEach((key, idx) => {
    assignments.push(`${key} = $${idx + 1}`);
    values.push(patch[key]);
  });
  values.push(tenantId);
  values.push(jobId);

  const result = await postgresPool.query(
    `UPDATE copilot.onboarding_jobs
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE tenant_id = $${keys.length + 1}
       AND id = $${keys.length + 2}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
};

const getOnboardingJobEvents = async ({ tenantId, jobId, limit = 20 }) => {
  const rowLimit = normalizeLimit(limit, 20, 200);
  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.onboarding_job_events
     WHERE tenant_id = $1 AND job_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, jobId, rowLimit]
  );
  return result.rows;
};

const getOnboardingJobById = async ({
  tenantId,
  jobId,
  includeEvents = false,
  eventLimit = 20,
}) => {
  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.onboarding_jobs
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, jobId]
  );

  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Onboarding job not found');
  }

  const job = result.rows[0];
  if (!includeEvents) return job;

  const events = await getOnboardingJobEvents({
    tenantId,
    jobId,
    limit: eventLimit,
  });
  return {
    ...job,
    events,
  };
};

const listOnboardingJobs = async ({
  tenantId,
  threadId = null,
  status = null,
  limit = 20,
  offset = 0,
}) => {
  const where = ['tenant_id = $1'];
  const values = [tenantId];

  if (threadId) {
    values.push(String(threadId));
    where.push(`thread_id = $${values.length}`);
  }
  if (status) {
    values.push(String(status));
    where.push(`status = $${values.length}`);
  }

  values.push(normalizeLimit(limit, 20, 200));
  const limitPos = values.length;
  values.push(normalizeOffset(offset, 0));
  const offsetPos = values.length;

  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.onboarding_jobs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${limitPos}
     OFFSET $${offsetPos}`,
    values
  );

  return result.rows;
};

const markOnboardingJobQueued = async ({ tenantId, jobId, actorUserId = null }) => {
  const job = await updateJob(jobId, tenantId, {
    status: 'queued',
    stage: 'queued',
    progress_pct: 5,
  });
  if (!job) return null;
  await appendOnboardingJobEvent({
    tenantId,
    jobId,
    eventType: 'job_queued',
    stage: 'queued',
    status: 'queued',
    progressPct: 5,
    message: 'Job queued for processing',
    createdBy: actorUserId,
  });
  return job;
};

const hasCompletedDryRunForFile = async ({ tenantId, sourceFileSha256 }) => {
  if (!tenantId || !sourceFileSha256) return false;
  const result = await postgresPool.query(
    `SELECT id
     FROM copilot.onboarding_jobs
     WHERE tenant_id = $1
       AND mode = 'dry_run'
       AND status = 'completed'
       AND source_file_sha256 = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, sourceFileSha256]
  );
  return result.rows.length > 0;
};

const createOnboardingJob = async ({
  tenantId,
  actorUserId,
  threadId = null,
  mode = 'import',
  file,
  idempotencyKey = null,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!file?.path) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CSV file is required');
  }

  const normalizedMode = resolveMode(mode);
  const normalizedThreadId = threadId || null;
  const normalizedIdempotencyKey = idempotencyKey
    ? String(idempotencyKey).trim() || null
    : null;
  const absPath = file.path;
  const sha256 = await fileSha256(absPath);

  if (normalizedMode === 'import') {
    const precheckPassed = await hasCompletedDryRunForFile({
      tenantId,
      sourceFileSha256: sha256,
    });
    if (!precheckPassed) {
      await safeDeleteUploadedFile(absPath);
      throw new ApiError(
        httpStatus.CONFLICT,
        'Import blocked: required checks not completed for this CSV. Run dry-run validation first, review issues, fix them, then start import.'
      );
    }
  }

  const requestHash = hashRequestPayload({
    mode: normalizedMode,
    threadId: normalizedThreadId,
    sourceFileSha256: sha256,
  });

  if (normalizedIdempotencyKey) {
    const existingResult = await postgresPool.query(
      `SELECT *
       FROM copilot.onboarding_jobs
       WHERE tenant_id = $1
         AND idempotency_key = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, normalizedIdempotencyKey]
    );
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.request_hash && String(existing.request_hash) !== requestHash) {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Idempotency key reuse with different payload: ${normalizedIdempotencyKey}`
        );
      }
      await safeDeleteUploadedFile(absPath);
      return { job: existing, deduped: true };
    }
  }

  const maxActiveJobs = Math.max(
    1,
    Number(config.copilot?.onboarding?.maxActiveJobsPerTenant || 3)
  );
  const activeCountResult = await postgresPool.query(
    `SELECT COUNT(*)::int AS count
     FROM copilot.onboarding_jobs
     WHERE tenant_id = $1
       AND status IN ('uploaded', 'queued', 'validating', 'importing')`,
    [tenantId]
  );
  const activeCount = Number(activeCountResult.rows[0]?.count || 0);
  if (activeCount >= maxActiveJobs) {
    await safeDeleteUploadedFile(absPath);
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      `Too many active onboarding jobs (${activeCount}). Wait for current jobs to finish before uploading another file.`
    );
  }

  let job = null;
  try {
    const insert = await postgresPool.query(
      `INSERT INTO copilot.onboarding_jobs (
         tenant_id,
         thread_id,
         status,
         stage,
         mode,
         upload_bytes,
         upload_received_bytes,
         source_file_name,
         source_mime_type,
         source_file_path,
         source_file_sha256,
         idempotency_key,
         request_hash,
         created_by
       )
       VALUES ($1, $2, 'uploaded', 'uploaded', $3, $4, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        normalizedThreadId,
        normalizedMode,
        Number(file.size || 0),
        String(file.originalname || 'onboarding.csv'),
        String(file.mimetype || 'text/csv'),
        absPath,
        sha256,
        normalizedIdempotencyKey,
        requestHash,
        actorUserId ? String(actorUserId) : null,
      ]
    );
    job = insert.rows[0];
  } catch (error) {
    if (String(error?.code) === '23505' && normalizedIdempotencyKey) {
      const existingResult = await postgresPool.query(
        `SELECT *
         FROM copilot.onboarding_jobs
         WHERE tenant_id = $1
           AND idempotency_key = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId, normalizedIdempotencyKey]
      );
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        if (existing.request_hash && String(existing.request_hash) !== requestHash) {
          throw new ApiError(
            httpStatus.CONFLICT,
            `Idempotency key reuse with different payload: ${normalizedIdempotencyKey}`
          );
        }
        await safeDeleteUploadedFile(absPath);
        return { job: existing, deduped: true };
      }
    }
    await safeDeleteUploadedFile(absPath);
    throw error;
  }

  await appendOnboardingJobEvent({
    tenantId,
    jobId: job.id,
    eventType: 'job_uploaded',
    stage: 'uploaded',
    status: 'uploaded',
    progressPct: 1,
    message: 'CSV uploaded successfully',
    payload: {
      fileName: job.source_file_name,
      uploadBytes: Number(job.upload_bytes || 0),
      mode: job.mode,
    },
    createdBy: actorUserId,
  });

  return { job, deduped: false };
};

const cancelOnboardingJob = async ({
  tenantId,
  jobId,
  cancelledBy = null,
  reason = 'Cancelled by user',
}) => {
  const existing = await getOnboardingJobById({ tenantId, jobId });
  const currentStatus = String(existing.status || '').toLowerCase();
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      ...existing,
      alreadyTerminal: true,
    };
  }

  const nextError = {
    ...(existing.error_json || {}),
    cancelledReason: String(reason || 'Cancelled by user'),
  };

  const cancelled = await updateJob(jobId, tenantId, {
    status: 'cancelled',
    stage: 'cancelled',
    progress_pct: 100,
    completed_at: new Date(),
    error_json: nextError,
  });

  await appendOnboardingJobEvent({
    tenantId,
    jobId,
    eventType: 'job_cancelled',
    stage: 'cancelled',
    status: 'cancelled',
    progressPct: 100,
    message: nextError.cancelledReason,
    payload: {
      cancelledBy: cancelledBy ? String(cancelledBy) : null,
    },
    createdBy: cancelledBy,
  });

  return cancelled;
};

const markOnboardingJobDeadLetter = async ({
  tenantId,
  jobId,
  errorMessage = 'Job dead-lettered',
  attemptsMade = 0,
  maxAttempts = 0,
}) => {
  const deadLetterError = {
    error: errorMessage,
    deadLettered: true,
    attemptsMade,
    maxAttempts,
  };
  const updated = await updateJob(jobId, tenantId, {
    status: 'failed',
    stage: 'failed',
    progress_pct: 100,
    completed_at: new Date(),
    error_json: deadLetterError,
  });

  await appendOnboardingJobEvent({
    tenantId,
    jobId,
    eventType: 'dead_letter',
    stage: 'failed',
    status: 'failed',
    progressPct: 100,
    message: `Moved to dead-letter queue after ${attemptsMade}/${maxAttempts} attempts`,
    payload: deadLetterError,
  });

  return updated;
};

const assertJobNotCancelled = async ({ tenantId, jobId }) => {
  const snapshot = await getOnboardingJobById({ tenantId, jobId });
  if (String(snapshot.status || '').toLowerCase() === 'cancelled') {
    throw new ApiError(httpStatus.CONFLICT, 'Onboarding job was cancelled');
  }
};

const processOnboardingJob = async ({
  tenantId,
  jobId,
  actorUser = {},
  attempt = 1,
  maxAttempts = 1,
}) => {
  const actorUserId = actorUser?.id || actorUser?._id || actorUser?.userId || null;
  const job = await getOnboardingJobById({ tenantId, jobId });
  const absPath = String(job.source_file_path || '');
  const mode = resolveMode(job.mode);
  const currentStatus = String(job.status || '').toLowerCase();

  if (TERMINAL_STATUSES.has(currentStatus)) return;

  if (!absPath || !fs.existsSync(absPath)) {
    await updateJob(jobId, tenantId, {
      status: 'failed',
      stage: 'failed',
      progress_pct: 100,
      error_json: {
        error: 'Uploaded CSV file not found on server',
      },
      completed_at: new Date(),
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: 'job_failed',
      stage: 'failed',
      status: 'failed',
      progressPct: 100,
      message: 'Uploaded CSV file not found on server',
      createdBy: actorUserId,
    });
    return;
  }

  try {
    await assertJobNotCancelled({ tenantId, jobId });
    await updateJob(jobId, tenantId, {
      status: 'validating',
      stage: 'validating',
      progress_pct: 10,
      started_at: new Date(),
      error_json: {},
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: 'validation_started',
      stage: 'validating',
      status: 'validating',
      progressPct: 10,
      message: `Validation started (attempt ${attempt}/${maxAttempts})`,
      createdBy: actorUserId,
    });

    const parsed = await parseCsvFileStream(absPath, MAX_ONBOARDING_ROWS);
    const rowCount = parsed.rows.length;

    await updateJob(jobId, tenantId, {
      total_rows: rowCount,
      processed_rows: 0,
      progress_pct: 25,
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: 'csv_loaded',
      stage: 'validating',
      status: 'validating',
      progressPct: 25,
      message: 'CSV stream parsed',
      payload: {
        totalRows: rowCount,
      },
      createdBy: actorUserId,
    });

    if (mode === 'dry_run') {
      const dryRun = await copilotOnboardingService.validateOnboardingCsvDryRun({
        tenantId,
        parsedRows: parsed.rows,
      });

      const status = dryRun.ok ? 'completed' : 'failed';
      await updateJob(jobId, tenantId, {
        status,
        stage: status,
        progress_pct: 100,
        processed_rows: rowCount,
        summary_json: dryRun.summary || {},
        error_json: {
          errors: dryRun.errors || [],
          warnings: dryRun.warnings || [],
        },
        completed_at: new Date(),
      });
      await appendOnboardingJobEvent({
        tenantId,
        jobId,
        eventType: dryRun.ok ? 'dry_run_completed' : 'dry_run_failed',
        stage: status,
        status,
        progressPct: 100,
        message: dryRun.ok ? 'Dry-run validation passed' : 'Dry-run validation failed',
        payload: {
          summary: dryRun.summary || {},
          errorCount: (dryRun.errors || []).length,
          warningCount: (dryRun.warnings || []).length,
        },
        createdBy: actorUserId,
      });
      return;
    }

    await assertJobNotCancelled({ tenantId, jobId });
    await updateJob(jobId, tenantId, {
      status: 'importing',
      stage: 'importing',
      progress_pct: 55,
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: 'import_started',
      stage: 'importing',
      status: 'importing',
      progressPct: 55,
      message: 'Import started',
      createdBy: actorUserId,
    });

    const imported = await copilotOnboardingService.importOnboardingCsv({
      tenantId,
      parsedRows: parsed.rows,
      actorUser,
    });

    const latest = await getOnboardingJobById({ tenantId, jobId });
    if (String(latest.status || '').toLowerCase() === 'cancelled') {
      await appendOnboardingJobEvent({
        tenantId,
        jobId,
        eventType: 'import_finished_after_cancel',
        stage: 'cancelled',
        status: 'cancelled',
        progressPct: 100,
        message: 'Import finished after cancellation request',
        createdBy: actorUserId,
      });
      return;
    }

    const status = imported.ok || imported.completedWithErrors ? 'completed' : 'failed';
    const failedRows = Array.isArray(imported.failures) ? imported.failures : [];
    await updateJob(jobId, tenantId, {
      status,
      stage: status,
      progress_pct: 100,
      processed_rows: rowCount,
      summary_json: imported.summary || {},
      error_json: {
        errors: imported.validationErrors || [],
        warnings: imported.warnings || [],
        failedRows,
        stageResults: imported.stageResults || [],
        nextStep: imported.nextStep || null,
        rolledBack: Boolean(imported.summary?.rolledBack),
      },
      completed_at: new Date(),
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: imported.completedWithErrors
        ? 'import_completed_with_errors'
        : imported.ok
          ? 'import_completed'
          : 'import_failed',
      stage: status,
      status,
      progressPct: 100,
      message: imported.completedWithErrors
        ? 'Import completed with errors'
        : imported.ok
          ? 'Import completed'
          : 'Import failed',
      payload: {
        summary: imported.summary || {},
        failedRows: failedRows.length,
      },
      createdBy: actorUserId,
    });
  } catch (error) {
    const message = error?.message || 'Onboarding processing failed';
    const code = String(error?.code || '');
    const isCancelled = /cancelled/i.test(message);
    const retryable = isRetryableError(error);

    if (isCancelled) {
      await updateJob(jobId, tenantId, {
        status: 'cancelled',
        stage: 'cancelled',
        progress_pct: 100,
        error_json: { error: message },
        completed_at: new Date(),
      });
      await appendOnboardingJobEvent({
        tenantId,
        jobId,
        eventType: 'job_cancelled',
        stage: 'cancelled',
        status: 'cancelled',
        progressPct: 100,
        message,
        createdBy: actorUserId,
      });
      return;
    }

    if (retryable && attempt < maxAttempts) {
      await updateJob(jobId, tenantId, {
        status: 'queued',
        stage: 'queued',
        progress_pct: 5,
        error_json: {
          error: message,
          code,
          retryable: true,
          attempt,
          maxAttempts,
        },
      });
      await appendOnboardingJobEvent({
        tenantId,
        jobId,
        eventType: 'job_retry_scheduled',
        stage: 'queued',
        status: 'queued',
        progressPct: 5,
        message: `Retry scheduled (${attempt}/${maxAttempts}) - ${message}`,
        payload: {
          code,
          attempt,
          maxAttempts,
        },
        createdBy: actorUserId,
      });

      const retryError = new Error(message);
      retryError.code = code || 'ONBOARDING_RETRYABLE_ERROR';
      throw retryError;
    }

    await updateJob(jobId, tenantId, {
      status: 'failed',
      stage: 'failed',
      progress_pct: 100,
      error_json: {
        error: message,
        code,
        retryable,
        attempt,
        maxAttempts,
      },
      completed_at: new Date(),
    });
    await appendOnboardingJobEvent({
      tenantId,
      jobId,
      eventType: 'job_failed',
      stage: 'failed',
      status: 'failed',
      progressPct: 100,
      message,
      payload: {
        code,
        retryable,
        attempt,
        maxAttempts,
      },
      createdBy: actorUserId,
    });
  }
};

const safeWithinOnboardingRoot = (targetPath) => {
  const root = path.resolve(ONBOARDING_UPLOAD_ROOT);
  const abs = path.resolve(String(targetPath || ''));
  return abs === root || abs.startsWith(`${root}${path.sep}`);
};

const listTenantUploadFiles = async () => {
  const files = [];
  if (!fs.existsSync(ONBOARDING_UPLOAD_ROOT)) return files;
  const tenants = await fs.promises.readdir(ONBOARDING_UPLOAD_ROOT);
  for (let i = 0; i < tenants.length; i += 1) {
    const tenantDir = path.join(ONBOARDING_UPLOAD_ROOT, tenants[i]);
    let stat;
    try {
      // eslint-disable-next-line no-await-in-loop
      stat = await fs.promises.stat(tenantDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let names = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      names = await fs.promises.readdir(tenantDir);
    } catch {
      continue;
    }
    for (let j = 0; j < names.length; j += 1) {
      const absPath = path.join(tenantDir, names[j]);
      let fileStat;
      try {
        // eslint-disable-next-line no-await-in-loop
        fileStat = await fs.promises.stat(absPath);
      } catch {
        continue;
      }
      if (fileStat.isFile()) {
        files.push({
          absPath,
          modifiedAt: fileStat.mtime,
          sizeBytes: fileStat.size,
        });
      }
    }
  }
  return files;
};

const cleanupOnboardingArtifacts = async ({
  fileTtlHours = config.copilot?.onboarding?.fileTtlHours || 72,
  orphanFileTtlHours = config.copilot?.onboarding?.orphanFileTtlHours || 168,
  jobRetentionDays = config.copilot?.onboarding?.jobRetentionDays || 30,
  batchLimit = 500,
}) => {
  const summary = {
    filePointersCleared: 0,
    filesDeleted: 0,
    orphanFilesDeleted: 0,
    jobsPurged: 0,
    errors: 0,
  };

  const fileRows = await postgresPool.query(
    `SELECT id, tenant_id, source_file_path
     FROM copilot.onboarding_jobs
     WHERE status IN ('completed', 'failed', 'cancelled')
       AND source_file_path IS NOT NULL
       AND COALESCE(completed_at, updated_at, created_at) < NOW() - ($1::text || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [Math.max(1, Number(fileTtlHours)), Math.max(1, Number(batchLimit))]
  );

  for (let i = 0; i < fileRows.rows.length; i += 1) {
    const row = fileRows.rows[i];
    const absPath = String(row.source_file_path || '');
    try {
      if (absPath && safeWithinOnboardingRoot(absPath) && fs.existsSync(absPath)) {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.unlink(absPath);
        summary.filesDeleted += 1;
      }
      // eslint-disable-next-line no-await-in-loop
      await updateJob(row.id, row.tenant_id, {
        source_file_path: null,
        source_file_sha256: null,
      });
      // eslint-disable-next-line no-await-in-loop
      await appendOnboardingJobEvent({
        tenantId: row.tenant_id,
        jobId: row.id,
        eventType: 'file_cleaned',
        stage: 'maintenance',
        status: null,
        message: 'Uploaded CSV file cleaned from temp storage',
      });
      summary.filePointersCleared += 1;
    } catch {
      summary.errors += 1;
    }
  }

  const referencedFilesResult = await postgresPool.query(
    `SELECT source_file_path
     FROM copilot.onboarding_jobs
     WHERE source_file_path IS NOT NULL`
  );
  const referencedFileSet = new Set(
    referencedFilesResult.rows
      .map((row) => String(row.source_file_path || ''))
      .filter(Boolean)
      .map((item) => path.resolve(item))
  );

  const orphanTtlMs = Math.max(1, Number(orphanFileTtlHours)) * 60 * 60 * 1000;
  const nowMs = Date.now();
  const localFiles = await listTenantUploadFiles();
  for (let i = 0; i < localFiles.length; i += 1) {
    const file = localFiles[i];
    const absPath = path.resolve(file.absPath);
    if (referencedFileSet.has(absPath)) continue;
    if (nowMs - new Date(file.modifiedAt).getTime() < orphanTtlMs) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.unlink(absPath);
      summary.orphanFilesDeleted += 1;
    } catch {
      summary.errors += 1;
    }
  }

  const purgedJobs = await postgresPool.query(
    `WITH expired AS (
      SELECT id
      FROM copilot.onboarding_jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND COALESCE(completed_at, updated_at, created_at) < NOW() - ($1::text || ' days')::interval
      ORDER BY created_at ASC
      LIMIT $2
    )
    DELETE FROM copilot.onboarding_jobs j
    USING expired
    WHERE j.id = expired.id
    RETURNING j.id`,
    [Math.max(1, Number(jobRetentionDays)), Math.max(1, Number(batchLimit))]
  );
  summary.jobsPurged = purgedJobs.rowCount || 0;

  return summary;
};

module.exports = {
  appendOnboardingJobEvent,
  createOnboardingJob,
  processOnboardingJob,
  getOnboardingJobById,
  getOnboardingJobEvents,
  listOnboardingJobs,
  markOnboardingJobQueued,
  cancelOnboardingJob,
  markOnboardingJobDeadLetter,
  cleanupOnboardingArtifacts,
};
