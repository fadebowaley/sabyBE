const crypto = require('crypto');
const axios = require('axios');
const ExecutiveSandboxExecution = require('../models/executiveSandboxExecution.model');
const generatedAnalysisPolicy = require('./executiveGeneratedAnalysisPolicy.service');

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_MEMORY_MB = 512;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_RETENTION_HOURS = 24;
const IMPLEMENTED_PROVIDERS = ['external_http'];

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const buildExecutionId = () =>
  `sandbox_${crypto
    .createHash('sha256')
    .update(`${Date.now()}:${process.hrtime.bigint()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 24)}`;

const fingerprintCode = (code) =>
  crypto
    .createHash('sha256')
    .update(String(code || '').replace(/\r\n/g, '\n').trim())
    .digest('hex');

const getSandboxProvider = () =>
  String(process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_PROVIDER || 'disabled').trim().toLowerCase() || 'disabled';

const isSandboxExecutionEnabled = () =>
  process.env.EXECUTIVE_INTELLIGENCE_ENABLE_SANDBOX === 'true' && IMPLEMENTED_PROVIDERS.includes(getSandboxProvider());

const getSandboxCapabilities = () => ({
  enabled: isSandboxExecutionEnabled(),
  provider: getSandboxProvider(),
  implementedProviders: IMPLEMENTED_PROVIDERS,
  supportedRuntimes: ['python'],
  networkAccess: false,
  productionCredentialsMounted: false,
  hostFilesystemMounted: false,
  dockerSocketMounted: false,
  defaultLimits: {
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    memoryMb: DEFAULT_MEMORY_MB,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },
  note:
    'Sandbox execution is fail-closed until an isolated worker provider is implemented and explicitly enabled by server policy.',
});

const buildLimits = (limits = {}) => ({
  timeoutSeconds: clampNumber(limits.timeoutSeconds, 1, 120, DEFAULT_TIMEOUT_SECONDS),
  memoryMb: clampNumber(limits.memoryMb, 128, 2048, DEFAULT_MEMORY_MB),
  maxOutputBytes: clampNumber(limits.maxOutputBytes, 1024, 10 * 1024 * 1024, DEFAULT_MAX_OUTPUT_BYTES),
  maxOutputFiles: clampNumber(limits.maxOutputFiles, 0, 5, 1),
});

const buildRetentionExpiry = () =>
  new Date(Date.now() + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);

const persistSandboxExecution = async (payload) => {
  const saved = await ExecutiveSandboxExecution.create(payload);
  if (typeof saved.toJSON === 'function') return saved.toJSON();
  return saved;
};

const updateSandboxExecution = async (sandboxExecutionId, patch) => {
  const updated = await ExecutiveSandboxExecution.findOneAndUpdate(
    { sandboxExecutionId },
    { $set: patch },
    { new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  if (typeof updated.toJSON === 'function') return updated.toJSON();
  return updated;
};

const runExternalHttpSandbox = async ({ record, code, inputPayload = null }) => {
  const sandboxUrl = String(process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_URL || '').trim();
  if (!sandboxUrl) {
    return {
      ok: false,
      errorCategory: 'SANDBOX_URL_NOT_CONFIGURED',
      errorMessage: 'External sandbox provider is enabled but EXECUTIVE_INTELLIGENCE_SANDBOX_URL is not configured.',
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = String(process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_TOKEN || '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await axios.post(
      sandboxUrl,
      {
        sandboxExecutionId: record.sandboxExecutionId,
        runtime: record.runtime,
        code,
        inputPayload,
        limits: record.limits,
      },
      {
        headers,
        timeout: Math.min(Number(record.limits?.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS) * 1000 + 5000, 125000),
        maxBodyLength: DEFAULT_MAX_OUTPUT_BYTES * 2,
        maxContentLength: DEFAULT_MAX_OUTPUT_BYTES * 2,
      }
    );

    return {
      ok: true,
      outputManifest: response.data?.outputManifest || {},
      worker: {
        status: response.data?.status || 'completed',
        runtime: response.data?.runtime || record.runtime,
        durationMs: response.data?.durationMs || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: 'SANDBOX_PROVIDER_FAILED',
      errorMessage: error.response?.data?.message || error.message,
      outputManifest: error.response?.data?.outputManifest || {},
    };
  }
};

const requestSandboxExecution = async ({
  tenantId,
  userId = null,
  requestId = null,
  artifactVersion = null,
  runtime = 'python',
  code,
  inputPayload = null,
  inputManifest = {},
  limits = {},
  metadata = {},
} = {}) => {
  if (!tenantId) {
    throw new Error('tenantId is required for sandbox execution');
  }

  const normalizedRuntime = String(runtime || 'python').toLowerCase();
  const provider = getSandboxProvider();
  const validationResult =
    normalizedRuntime === 'python'
      ? generatedAnalysisPolicy.validateGeneratedCode(code, {
          language: normalizedRuntime,
          disallowImports: provider === 'external_http',
        })
      : {
          ok: false,
          code: 'SANDBOX_RUNTIME_NOT_ALLOWED',
          message: 'Only Python sandbox requests are accepted at this stage',
        };

  const policySnapshot = {
    generatedAnalysis: generatedAnalysisPolicy.getPolicySnapshot(),
    sandbox: getSandboxCapabilities(),
  };
  const blockedBecauseDisabled = validationResult.ok && !isSandboxExecutionEnabled();
  const now = new Date();

  const record = await persistSandboxExecution({
    sandboxExecutionId: buildExecutionId(),
    tenantId,
    userId,
    requestId,
    artifactVersion,
    runtime: normalizedRuntime,
    sandboxProvider: provider,
    status: validationResult.ok && !blockedBecauseDisabled ? 'queued' : 'blocked',
    codeFingerprint: fingerprintCode(code),
    codeBytes: Buffer.byteLength(String(code || ''), 'utf8'),
    inputManifest,
    outputManifest: {},
    limits: buildLimits(limits),
    validationResult,
    policySnapshot,
    errorCategory: validationResult.ok
      ? blockedBecauseDisabled
        ? 'SANDBOX_DISABLED'
        : null
      : validationResult.code || 'SANDBOX_VALIDATION_FAILED',
    errorMessage: validationResult.ok
      ? blockedBecauseDisabled
        ? 'Sandbox execution is disabled until an isolated worker provider is implemented and enabled.'
        : null
      : validationResult.message,
    completedAt: validationResult.ok && !blockedBecauseDisabled ? null : now,
    destroyedAt: validationResult.ok && !blockedBecauseDisabled ? null : now,
    retentionExpiresAt: buildRetentionExpiry(),
    metadata: {
      ...metadata,
      rawCodeStored: false,
      rawDatasetStored: false,
    },
  });

  if (record.status === 'blocked') {
    return {
      sandboxExecutionId: record.sandboxExecutionId,
      status: record.status,
      runtime: record.runtime,
      sandboxProvider: record.sandboxProvider,
      validationResult: record.validationResult,
      policySnapshot: record.policySnapshot,
      limits: record.limits,
      inputManifest: record.inputManifest,
      outputManifest: record.outputManifest,
      errorCategory: record.errorCategory,
      errorMessage: record.errorMessage,
      codeFingerprint: record.codeFingerprint,
      codeBytes: record.codeBytes,
      retentionExpiresAt: record.retentionExpiresAt,
    };
  }

  await updateSandboxExecution(record.sandboxExecutionId, {
    status: 'running',
    startedAt: new Date(),
  });

  const providerResult =
    provider === 'external_http'
      ? await runExternalHttpSandbox({ record, code, inputPayload })
      : {
          ok: false,
          errorCategory: 'SANDBOX_PROVIDER_NOT_IMPLEMENTED',
          errorMessage: `Sandbox provider ${provider} is not implemented.`,
        };

  const finalPatch = providerResult.ok
    ? {
        status: 'completed',
        outputManifest: providerResult.outputManifest || {},
        completedAt: new Date(),
        destroyedAt: new Date(),
        errorCategory: null,
        errorMessage: null,
        metadata: {
          ...(record.metadata || {}),
          worker: providerResult.worker || {},
          rawCodeStored: false,
          rawDatasetStored: false,
        },
      }
    : {
        status: 'failed',
        outputManifest: providerResult.outputManifest || {},
        completedAt: new Date(),
        destroyedAt: new Date(),
        errorCategory: providerResult.errorCategory || 'SANDBOX_PROVIDER_FAILED',
        errorMessage: providerResult.errorMessage || 'Sandbox provider failed',
      };

  const finalRecord = await updateSandboxExecution(record.sandboxExecutionId, finalPatch);

  return {
    sandboxExecutionId: finalRecord?.sandboxExecutionId || record.sandboxExecutionId,
    status: finalRecord?.status || finalPatch.status,
    runtime: finalRecord?.runtime || record.runtime,
    sandboxProvider: finalRecord?.sandboxProvider || record.sandboxProvider,
    validationResult: finalRecord?.validationResult || record.validationResult,
    policySnapshot: finalRecord?.policySnapshot || record.policySnapshot,
    limits: finalRecord?.limits || record.limits,
    inputManifest: finalRecord?.inputManifest || record.inputManifest,
    outputManifest: finalRecord?.outputManifest || finalPatch.outputManifest,
    errorCategory: finalRecord?.errorCategory || finalPatch.errorCategory,
    errorMessage: finalRecord?.errorMessage || finalPatch.errorMessage,
    codeFingerprint: finalRecord?.codeFingerprint || record.codeFingerprint,
    codeBytes: finalRecord?.codeBytes || record.codeBytes,
    retentionExpiresAt: finalRecord?.retentionExpiresAt || record.retentionExpiresAt,
  };
};

module.exports = {
  getSandboxCapabilities,
  requestSandboxExecution,
  fingerprintCode,
};
