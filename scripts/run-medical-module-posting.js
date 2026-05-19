#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG = {
  apiBase: process.env.API_BASE || 'https://api.saby.ai',
  adminEmail: process.env.ADMIN_EMAIL || 'isreal@sotsm.org',
  adminPassword: process.env.ADMIN_PASSWORD || '@judah_saby1',
  authMode: process.env.AUTH_MODE || 'representative', // representative | admin_on_behalf
  tenantId: process.env.TENANT_ID || '8SnqteS03y',
  moduleId: process.env.MODULE_ID || 'proj_medical-consultation-form-oez66l',
  defaultPassword: process.env.DEFAULT_PASSWORD || 'Saby@Post2026!',
  pageSize: Number(process.env.PAGE_SIZE || 100),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 45000),
  maxPollAttempts: Number(process.env.MAX_POLL_ATTEMPTS || 25),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 1200),
  skipPasswordReset:
    String(process.env.SKIP_PASSWORD_RESET || '').toLowerCase() === 'true',
  autoVerifyForPosting:
    String(process.env.AUTO_VERIFY_FOR_POSTING || 'true').toLowerCase() ===
    'true',
  loginRetryAttempts: Number(process.env.LOGIN_RETRY_ATTEMPTS || 3),
  loginCooldownMs: Number(process.env.LOGIN_COOLDOWN_MS || 310000),
  verifyPollAttempts: Number(process.env.VERIFY_POLL_ATTEMPTS || 12),
  verifyPollIntervalMs: Number(process.env.VERIFY_POLL_INTERVAL_MS || 1200),
  dryRun: String(process.env.DRY_RUN || '').toLowerCase() === 'true',
};

const now = new Date();
const batchId = `batch-${now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}`;
const outputDir = path.join(process.cwd(), 'artifacts', 'module-posting', batchId);

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthValue(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath, rows, preferredHeaders = []) {
  const headers = Array.from(
    new Set([
      ...preferredHeaders,
      ...rows.flatMap((row) => Object.keys(row || {})),
    ])
  );

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function createClient(token = null) {
  return axios.create({
    baseURL: CONFIG.apiBase,
    timeout: CONFIG.requestTimeoutMs,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
}

async function login(email, password) {
  const client = createClient();
  const res = await client.post('/v1/auth/login', { email, password });
  if (res.status !== 200 || !res.data?.tokens?.access?.token) {
    const message =
      res.data?.message ||
      res.data?.error ||
      `Login failed (${res.status})`;
    throw new Error(`${message} for ${email}`);
  }
  return {
    token: res.data.tokens.access.token,
    user: res.data.user,
  };
}

async function fetchAllPages(client, endpoint, params = {}) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await client.get(endpoint, {
      params: { ...params, page, limit: CONFIG.pageSize },
    });

    if (res.status !== 200) {
      throw new Error(
        `Failed paging ${endpoint} page=${page}: ${res.status} ${JSON.stringify(res.data).slice(0, 220)}`
      );
    }

    const rows = res.data?.results || res.data?.data || [];
    all.push(...rows);

    totalPages = Number(res.data?.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return all;
}

function pickRepresentative(node) {
  const users = Array.isArray(node?.users) ? node.users : [];
  const withEmail = users.filter((u) => u && (u.email || u.user_email));
  if (!withEmail.length) return null;
  const rep = withEmail[0];
  return {
    userMongoId: rep._id || rep.id || null,
    email: rep.email || rep.user_email || null,
    firstname: rep.firstname || rep.firstName || '',
    lastname: rep.lastname || rep.lastName || '',
  };
}

function buildMedicalPayload({ node, representative, eventDate, month }) {
  const nodeRef = node.nodeId || node._id || 'NODE';
  const repName = [representative.firstname, representative.lastname].filter(Boolean).join(' ') || 'Assigned Clinician';
  const followupDate = toIsoDate(new Date(new Date(eventDate).getTime() + 7 * 86400000));

  return {
    tenantId: CONFIG.tenantId,
    projectId: CONFIG.moduleId,
    formId: CONFIG.moduleId,
    nodeId: node.nodeId,
    node_name: node.name,
    project_name: 'Medical Consultation Form',
    project_category: 'Medical',
    source: 'web',
    month,
    event_date: eventDate,
    submission_date: eventDate,
    payload: {
      'consult-patient-id': `PAT-${nodeRef}-${eventDate.replace(/-/g, '')}`,
      'consult-date': eventDate,
      'consult-chief-complaint': `Routine medical consultation recorded for ${node.name}`,
      'consult-symptoms': ['Fatigue', 'Headache'],
      'consult-examination': 'Vitals stable; no acute distress observed.',
      'consult-diagnosis': 'General outpatient review - stable.',
      'consult-prescription': 'Hydration, rest, and follow-up monitoring.',
      'consult-tests': ['Blood Test'],
      'consult-followup': followupDate,
      'consult-notes': `Automated module posting run (${batchId})`,
      'consult-physician': repName,
      'doctor-consultation-industry-consent': 'Yes',
      'doctor-consultation-industry-priority': 'Routine',
      'doctor-consultation-industry-clinician-notes': 'No escalation required.',
      'doctor-consultation-consult-room': `Room-${(nodeRef || '').slice(-3)}`,
      'doctor-consultation-consult-bmi': 24.2,
    },
  };
}

function chooseAllowedDate(allowedDates = []) {
  if (!Array.isArray(allowedDates) || !allowedDates.length) return null;
  const today = toIsoDate(new Date());

  const isOpen = (d) =>
    d &&
    d.locked !== true &&
    d.status !== 'locked' &&
    d.isFull !== true &&
    d.status !== 'full';

  const futureOrToday = allowedDates.find((d) => isOpen(d) && d.date >= today);
  if (futureOrToday) return futureOrToday.date;

  const anyOpen = allowedDates.find((d) => isOpen(d));
  return anyOpen?.date || null;
}

function parseJobState(jobLogResponse) {
  const events = jobLogResponse?.data || [];
  if (!Array.isArray(events) || events.length === 0) {
    return { terminal: false, state: 'missing', message: 'No job events yet' };
  }

  const ranked = ['dead_letter', 'failed', 'completed', 'processing', 'queued'];
  const normalized = events.map((e) => ({
    action: String(e.action || '').toLowerCase(),
    status: String(e.status || '').toLowerCase(),
    message: e.message || '',
    createdAt: e.created_at || null,
    raw: e,
  }));

  const pick = (action) => normalized.find((e) => e.action === action);
  const terminalEvent = pick('dead_letter') || pick('failed') || pick('completed');
  if (terminalEvent) {
    const state = terminalEvent.action === 'completed' ? 'completed' : terminalEvent.action;
    return { terminal: true, state, message: terminalEvent.message, event: terminalEvent.raw, count: events.length };
  }

  const current = normalized.sort((a, b) => ranked.indexOf(a.action) - ranked.indexOf(b.action))[0] || normalized[0];
  return {
    terminal: false,
    state: current.action || current.status || 'processing',
    message: current.message,
    event: current.raw,
    count: events.length,
  };
}

async function runVerifyAccountAction(adminClient, email) {
  const createRes = await adminClient.post('/v1/copilot/actions', {
    actionType: 'verify_account',
    entityType: 'user',
    payload: { email },
    source: 'api',
    priority: 0,
  });

  if (!(createRes.status >= 200 && createRes.status < 300)) {
    return {
      ok: false,
      message: `verify action create failed (${createRes.status}): ${
        createRes.data?.message || createRes.data?.error || 'unknown error'
      }`,
    };
  }

  const eventId = createRes.data?.event?.id || createRes.data?.id;
  if (!eventId) {
    return { ok: false, message: 'verify action created but missing eventId' };
  }

  for (let i = 1; i <= CONFIG.verifyPollAttempts; i += 1) {
    const pollRes = await adminClient.get(`/v1/copilot/actions/${eventId}`);
    if (pollRes.status >= 200 && pollRes.status < 300) {
      const evt = pollRes.data || {};
      if (evt.status === 'completed') {
        return { ok: true, message: `verify action completed (${eventId})` };
      }
      if (evt.status === 'failed' || evt.status === 'dead_letter') {
        return {
          ok: false,
          message: `verify action failed (${eventId}): ${evt.error_message || 'unknown error'}`,
        };
      }
    }
    await sleep(CONFIG.verifyPollIntervalMs);
  }

  return {
    ok: false,
    message: `verify action timeout (${eventId})`,
  };
}

async function loginWithRetry(email, password) {
  let lastError = null;

  for (let attempt = 1; attempt <= CONFIG.loginRetryAttempts; attempt += 1) {
    try {
      return await login(email, password);
    } catch (error) {
      lastError = error;
      const msg = String(error.message || '');
      const isRateLimit = /Too many login attempts/i.test(msg);
      if (isRateLimit && attempt < CONFIG.loginRetryAttempts) {
        logger.warn(
          `Login rate limited for ${email}. Cooling down ${CONFIG.loginCooldownMs}ms before retry ${attempt + 1}/${CONFIG.loginRetryAttempts}.`
        );
        await sleep(CONFIG.loginCooldownMs);
        continue;
      }
      if (attempt < CONFIG.loginRetryAttempts) {
        await sleep(500);
      }
    }
  }

  throw lastError || new Error(`login failed for ${email}`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  logger.info(`Batch: ${batchId}`);
  logger.info(`Artifacts directory: ${outputDir}`);

  const summary = {
    batchId,
    startedAt: new Date().toISOString(),
    config: {
      apiBase: CONFIG.apiBase,
      tenantId: CONFIG.tenantId,
      moduleId: CONFIG.moduleId,
      authMode: CONFIG.authMode,
      dryRun: CONFIG.dryRun,
      skipPasswordReset: CONFIG.skipPasswordReset,
      autoVerifyForPosting: CONFIG.autoVerifyForPosting,
      loginRetryAttempts: CONFIG.loginRetryAttempts,
      defaultPasswordMasked: `${CONFIG.defaultPassword.slice(0, 2)}***${CONFIG.defaultPassword.slice(-2)}`,
    },
    counters: {},
    notes: [],
  };

  // 1) Admin auth + core datasets
  logger.info('Authenticating admin user...');
  const adminAuth = await login(CONFIG.adminEmail, CONFIG.adminPassword);
  const admin = createClient(adminAuth.token);

  logger.info('Fetching module definition...');
  const moduleRes = await admin.get(`/v1/project-forms/project/${CONFIG.moduleId}`);
  if (moduleRes.status !== 200) {
    throw new Error(`Module fetch failed: ${moduleRes.status} ${JSON.stringify(moduleRes.data).slice(0, 260)}`);
  }

  const moduleDef = moduleRes.data;
  if (moduleDef.tenantId !== CONFIG.tenantId) {
    throw new Error(`Tenant mismatch. Module tenant=${moduleDef.tenantId}, expected=${CONFIG.tenantId}`);
  }

  logger.info('Fetching active nodes...');
  const nodes = await fetchAllPages(admin, '/v1/node', { status: 'active' });

  logger.info('Fetching tenant users...');
  const users = await fetchAllPages(admin, '/v1/users', {});
  const tenantUsers = users.filter((u) => String(u.tenantId || '') === CONFIG.tenantId);
  const tenantUserByEmail = new Map(
    tenantUsers
      .filter((u) => u.email)
      .map((u) => [String(u.email).toLowerCase(), u])
  );

  const nodesWithReps = nodes
    .map((node) => {
      const rep = pickRepresentative(node);
      return {
        nodeMongoId: node._id || node.id || null,
        nodeId: node.nodeId || null,
        nodeName: node.name || null,
        level: node?.level?.name || null,
        levelRank: node?.level?.rank ?? null,
        assignedUsersCount: Array.isArray(node.users) ? node.users.length : 0,
        representativeEmail: rep?.email || null,
        representativeUserId: rep?.userMongoId || null,
        representativeFirstname: rep?.firstname || null,
        representativeLastname: rep?.lastname || null,
      };
    })
    .sort((a, b) => String(a.nodeId || '').localeCompare(String(b.nodeId || '')));

  writeCsv(
    path.join(outputDir, 'nodes_assigned_users.csv'),
    nodesWithReps,
    [
      'nodeId',
      'nodeName',
      'level',
      'levelRank',
      'assignedUsersCount',
      'representativeEmail',
      'representativeFirstname',
      'representativeLastname',
      'representativeUserId',
      'nodeMongoId',
    ]
  );

  // Optional pre-verification pass to avoid OTP login blockers during bulk posting
  const verificationRows = [];
  if (CONFIG.autoVerifyForPosting && !CONFIG.dryRun) {
    const repEmails = Array.from(
      new Set(
        nodesWithReps
          .map((n) => (n.representativeEmail || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    logger.info(
      `Pre-verifying representative accounts (${repEmails.length}) via copilot verify_account action...`
    );

    for (const email of repEmails) {
      const verifyResult = await runVerifyAccountAction(admin, email);
      verificationRows.push({
        email,
        status: verifyResult.ok ? 'success' : 'failed',
        message: verifyResult.message,
      });
    }
  }

  writeCsv(
    path.join(outputDir, 'account_verification_results.csv'),
    verificationRows,
    ['email', 'status', 'message']
  );

  // 2) Password reset for tenant users
  const resetRows = [];
  logger.info(
    CONFIG.skipPasswordReset
      ? 'Skipping password reset by flag (SKIP_PASSWORD_RESET=true).'
      : `Resetting passwords for ${tenantUsers.length} tenant users to one default (requested)...`
  );

  for (const user of tenantUsers) {
    const userId = user._id || user.id;
    const email = user.email || '';
    const row = {
      userId,
      email,
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      status: 'skipped',
      httpStatus: null,
      message: '',
    };

    if (!userId) {
      row.status = 'failed';
      row.message = 'missing user id';
      resetRows.push(row);
      continue;
    }

    if (CONFIG.dryRun) {
      row.status = 'dry-run';
      row.message = 'password reset skipped (dry run)';
      resetRows.push(row);
      continue;
    }

    if (CONFIG.skipPasswordReset) {
      row.status = 'skipped';
      row.message = 'password reset skipped (flag enabled)';
      resetRows.push(row);
      continue;
    }

    const res = await admin.patch(`/v1/users/${userId}`, {
      password: CONFIG.defaultPassword,
    });

    row.httpStatus = res.status;
    if (res.status >= 200 && res.status < 300) {
      row.status = 'success';
      row.message = 'password reset';
    } else {
      row.status = 'failed';
      row.message = res.data?.message || res.data?.error || JSON.stringify(res.data).slice(0, 200);
    }

    resetRows.push(row);
  }

  writeCsv(
    path.join(outputDir, 'password_reset_results.csv'),
    resetRows,
    ['userId', 'email', 'firstname', 'lastname', 'status', 'httpStatus', 'message']
  );

  // 3) Posting by node representative through normal /v1/submissions
  logger.info('Submitting one post per node (representative user)...');

  const postedRows = [];
  const tokenCache = new Map();
  const currentMonth = monthValue();

  for (const node of nodesWithReps) {
    const postRow = {
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      level: node.level,
      representativeEmail: node.representativeEmail,
      representativeUserId: node.representativeUserId,
      month: currentMonth,
      eventDate: null,
      jobId: null,
      submitHttpStatus: null,
      submitStatus: null,
      submitMessage: null,
      payloadPreview: null,
      skipReason: null,
    };

    if (!node.nodeId) {
      postRow.submitStatus = 'skipped';
      postRow.skipReason = 'nodeId missing';
      postedRows.push(postRow);
      continue;
    }

    if (!node.representativeEmail) {
      postRow.submitStatus = 'skipped';
      postRow.skipReason = 'no assigned user for node';
      postedRows.push(postRow);
      continue;
    }

    let userToken = tokenCache.get(node.representativeEmail);
    if (!userToken) {
      if (CONFIG.dryRun || CONFIG.authMode === 'admin_on_behalf') {
        userToken = adminAuth.token;
      } else {
        try {
          const userAuth = await loginWithRetry(
            node.representativeEmail,
            CONFIG.defaultPassword
          );
          userToken = userAuth.token;
          tokenCache.set(node.representativeEmail, userToken);
        } catch (error) {
          const errorMsg = String(error.message || '');
          const isOtpGate = /verify your account using the OTP/i.test(errorMsg);

          if (CONFIG.autoVerifyForPosting && isOtpGate) {
            const verifyResult = await runVerifyAccountAction(
              admin,
              node.representativeEmail
            );
            if (verifyResult.ok) {
              try {
                const userAuth = await loginWithRetry(
                  node.representativeEmail,
                  CONFIG.defaultPassword
                );
                userToken = userAuth.token;
                tokenCache.set(node.representativeEmail, userToken);
              } catch (retryError) {
                postRow.submitStatus = 'skipped';
                postRow.skipReason = `login failed after auto-verify: ${retryError.message}`;
                postedRows.push(postRow);
                continue;
              }
            } else {
              postRow.submitStatus = 'skipped';
              postRow.skipReason = verifyResult.message;
              postedRows.push(postRow);
              continue;
            }
          } else {
            postRow.submitStatus = 'skipped';
            postRow.skipReason = `login failed: ${error.message}`;
            postedRows.push(postRow);
            continue;
          }
        }
      }
    }

    const userClient = createClient(userToken);

    const allowedRes = await userClient.get('/v1/submissions/allowed-dates', {
      params: {
        projectId: CONFIG.moduleId,
        nodeId: node.nodeId,
        month: currentMonth,
      },
    });

    if (allowedRes.status !== 200) {
      postRow.submitStatus = 'skipped';
      postRow.skipReason = `allowed-dates failed: ${allowedRes.status} ${allowedRes.data?.message || ''}`;
      postedRows.push(postRow);
      continue;
    }

    const effectiveMonth = allowedRes.data?.month || currentMonth;
    const eventDate = chooseAllowedDate(allowedRes.data?.dates || []);
    if (!eventDate) {
      postRow.submitStatus = 'skipped';
      postRow.skipReason = 'no available event date';
      postRow.month = effectiveMonth;
      postedRows.push(postRow);
      continue;
    }

    postRow.month = effectiveMonth;
    postRow.eventDate = eventDate;

    const payload = buildMedicalPayload({
      node: { nodeId: node.nodeId, name: node.nodeName },
      representative: {
        firstname: node.representativeFirstname,
        lastname: node.representativeLastname,
      },
      eventDate,
      month: effectiveMonth,
    });

    postRow.payloadPreview = {
      'consult-patient-id': payload.payload['consult-patient-id'],
      'consult-date': payload.payload['consult-date'],
      nodeId: payload.nodeId,
      month: payload.month,
      event_date: payload.event_date,
    };

    if (CONFIG.dryRun) {
      postRow.submitStatus = 'dry-run';
      postRow.submitMessage = 'submission skipped (dry run)';
      postedRows.push(postRow);
      continue;
    }

    const submitRes = await userClient.post('/v1/submissions', payload);
    postRow.submitHttpStatus = submitRes.status;
    postRow.submitStatus = submitRes.data?.status || (submitRes.status === 202 ? 'queued' : 'failed');
    postRow.submitMessage = submitRes.data?.message || submitRes.data?.error || null;
    postRow.jobId = submitRes.data?.jobId || null;

    if (submitRes.status < 200 || submitRes.status >= 300) {
      postRow.skipReason = `submit failed: ${submitRes.status}`;
    }

    postedRows.push(postRow);
  }

  writeCsv(
    path.join(outputDir, 'posted_form_data_per_node.csv'),
    postedRows,
    [
      'nodeId',
      'nodeName',
      'level',
      'representativeEmail',
      'representativeUserId',
      'month',
      'eventDate',
      'submitHttpStatus',
      'submitStatus',
      'submitMessage',
      'jobId',
      'skipReason',
      'payloadPreview',
    ]
  );

  // 4) Monitor pipeline per submitted job
  logger.info('Monitoring queue pipeline for submitted jobs...');
  const pipelineRows = [];
  const queued = postedRows.filter((r) => r.jobId);

  for (const row of queued) {
    let final = {
      terminal: false,
      state: 'timeout',
      message: 'No terminal event observed within poll window',
      event: null,
      count: 0,
    };

    for (let attempt = 1; attempt <= CONFIG.maxPollAttempts; attempt += 1) {
      const pollRes = await admin.get(`/v1/submissions/activity-log/job/${row.jobId}`);
      if (pollRes.status === 200) {
        final = parseJobState(pollRes.data);
        if (final.terminal) {
          break;
        }
      }
      await sleep(CONFIG.pollIntervalMs);
    }

    pipelineRows.push({
      nodeId: row.nodeId,
      nodeName: row.nodeName,
      representativeEmail: row.representativeEmail,
      jobId: row.jobId,
      finalState: final.state,
      terminal: final.terminal,
      message: final.message,
      eventCount: final.count,
      action: final.event?.action || null,
      status: final.event?.status || null,
      createdAt: final.event?.created_at || null,
      source: final.event?.source || null,
      formReference: final.event?.form_reference || null,
      nodeReference: final.event?.node_reference || null,
    });
  }

  writeCsv(
    path.join(outputDir, 'job_pipeline_results.csv'),
    pipelineRows,
    [
      'nodeId',
      'nodeName',
      'representativeEmail',
      'jobId',
      'finalState',
      'terminal',
      'message',
      'eventCount',
      'action',
      'status',
      'createdAt',
      'source',
      'formReference',
      'nodeReference',
    ]
  );

  const counters = {
    nodesTotal: nodesWithReps.length,
    nodesWithRepresentative: nodesWithReps.filter((n) => n.representativeEmail).length,
    passwordResetTotal: resetRows.length,
    passwordResetSuccess: resetRows.filter((r) => r.status === 'success').length,
    passwordResetFailed: resetRows.filter((r) => r.status === 'failed').length,
    accountVerificationTotal: verificationRows.length,
    accountVerificationSuccess: verificationRows.filter((r) => r.status === 'success').length,
    accountVerificationFailed: verificationRows.filter((r) => r.status === 'failed').length,
    postingQueued: postedRows.filter((r) => r.jobId).length,
    postingSkipped: postedRows.filter((r) => r.submitStatus === 'skipped').length,
    postingFailedAtRequest: postedRows.filter((r) => !r.jobId && r.submitStatus && r.submitStatus !== 'skipped').length,
    pipelineCompleted: pipelineRows.filter((r) => r.finalState === 'completed').length,
    pipelineFailed: pipelineRows.filter((r) => r.finalState === 'failed' || r.finalState === 'dead_letter').length,
    pipelineTimeout: pipelineRows.filter((r) => r.finalState === 'timeout' || r.finalState === 'missing').length,
  };

  summary.counters = counters;
  summary.finishedAt = new Date().toISOString();
  summary.artifacts = {
    nodesAssignedUsers: path.join(outputDir, 'nodes_assigned_users.csv'),
    accountVerificationResults: path.join(
      outputDir,
      'account_verification_results.csv'
    ),
    passwordResetResults: path.join(outputDir, 'password_reset_results.csv'),
    postedFormData: path.join(outputDir, 'posted_form_data_per_node.csv'),
    jobPipelineResults: path.join(outputDir, 'job_pipeline_results.csv'),
  };

  fs.writeFileSync(path.join(outputDir, 'run_summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  logger.info(`Done. Summary: ${JSON.stringify(counters)}`);
  logger.info(`Artifacts saved in ${outputDir}`);
}

main().catch((error) => {
  logger.error(error.stack || error.message || String(error));
  process.exit(1);
});
