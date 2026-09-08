const crypto = require('crypto');
const httpStatus = require('http-status');
const https = require('https');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const config = require('../config/config');
const { postgresPool } = require('../config/postgres');

// 32-byte key derived from JWT_SECRET or BYOK_ENCRYPTION_KEY
const ENCRYPTION_SECRET = crypto
  .createHash('sha256')
  .update(
    process.env.BYOK_ENCRYPTION_KEY ||
      config.jwt.secret ||
      'saby_default_byok_encryption_secret_key'
  )
  .digest();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:ciphertext_hex
 */
const encryptSecret = (plainText) => {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_SECRET, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts a payload encrypted with encryptSecret.
 */
const decryptSecret = (encryptedPayload) => {
  if (!encryptedPayload || !encryptedPayload.includes(':')) return '';
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, authTagHex, cipherText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_SECRET, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error(`[ByokService] Decryption failed: ${error.message}`);
    return '';
  }
};

/**
 * Masks an API key for safe UI display (e.g. sk-proj-...3A)
 */
const maskApiKey = (key) => {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 7);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
};

let _tableEnsured = false;

/**
 * Ensures copilot.tenants_config table exists with byok_keys column
 */
const ensureTenantsConfigTable = async () => {
  if (_tableEnsured) return;
  try {
    await postgresPool.query(`CREATE SCHEMA IF NOT EXISTS copilot;`);
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS copilot.tenants_config (
        tenant_id VARCHAR(128) PRIMARY KEY,
        byok_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
        features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    // Ensure column exists in case table was created previously without it
    await postgresPool.query(`
      ALTER TABLE copilot.tenants_config 
      ADD COLUMN IF NOT EXISTS byok_keys JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    _tableEnsured = true;
  } catch (error) {
    logger.warn(
      `[ByokService] Error verifying tenants_config table: ${error.message}`
    );
  }
};

const SUPPORTED_PROVIDERS = ['openai', 'gemini', 'deepseek', 'claude'];

/**
 * Retrieves configured BYOK keys for a tenant (masked).
 */
const getTenantByokKeys = async (tenantId) => {
  if (!tenantId) return {};
  await ensureTenantsConfigTable();

  try {
    const res = await postgresPool.query(
      `SELECT byok_keys FROM copilot.tenants_config WHERE tenant_id = $1 LIMIT 1;`,
      [String(tenantId)]
    );

    if (res.rows.length === 0 || !res.rows[0].byok_keys) {
      return {};
    }

    const rawKeys = res.rows[0].byok_keys || {};
    const sanitized = {};

    SUPPORTED_PROVIDERS.forEach((provider) => {
      if (rawKeys[provider]) {
        sanitized[provider] = {
          provider,
          enabled: Boolean(rawKeys[provider].enabled),
          keyMask: rawKeys[provider].keyMask || '••••••••',
          defaultModel: rawKeys[provider].defaultModel || null,
          hasKey: Boolean(rawKeys[provider].encryptedKey),
          updatedAt: rawKeys[provider].updatedAt || null,
        };
      }
    });

    return sanitized;
  } catch (error) {
    logger.error(
      `[ByokService] Error fetching tenant BYOK keys for ${tenantId}: ${error.message}`
    );
    return {};
  }
};

/**
 * Saves or updates a BYOK key for a specific provider.
 */
const saveTenantByokKey = async ({
  tenantId,
  provider,
  apiKey,
  defaultModel = null,
  enabled = true,
}) => {
  if (!tenantId)
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  const normalizedProvider = String(provider || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(normalizedProvider)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  await ensureTenantsConfigTable();

  if (!apiKey) {
    if (enabled !== undefined) {
      try {
        await postgresPool.query(
          `UPDATE copilot.tenants_config
           SET byok_keys = jsonb_set(
             COALESCE(byok_keys, '{}'::jsonb),
             ARRAY[$2::text, 'enabled'],
             to_jsonb($3::boolean),
             false
           ),
           updated_at = now()
           WHERE tenant_id = $1;`,
          [String(tenantId), normalizedProvider, Boolean(enabled)]
        );
        return {
          provider: normalizedProvider,
          enabled: Boolean(enabled),
          hasKey: true,
        };
      } catch (error) {
        logger.error(
          `[ByokService] Error toggling BYOK key for ${tenantId}: ${error.message}`
        );
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to update key status'
        );
      }
    }
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid API key is required');
  }

  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid API key is required (minimum 8 characters)');
  }

  const trimmedKey = apiKey.trim();
  const encryptedKey = encryptSecret(trimmedKey);
  const keyMask = maskApiKey(trimmedKey);
  const now = new Date().toISOString();

  try {
    const providerConfig = {
      provider: normalizedProvider,
      encryptedKey,
      keyMask,
      defaultModel,
      enabled: Boolean(enabled),
      updatedAt: now,
    };

    await postgresPool.query(
      `INSERT INTO copilot.tenants_config (tenant_id, byok_keys, updated_at)
       VALUES ($1, jsonb_build_object($2::text, $3::jsonb), now())
       ON CONFLICT (tenant_id) DO UPDATE
       SET byok_keys = jsonb_set(
         COALESCE(copilot.tenants_config.byok_keys, '{}'::jsonb),
         ARRAY[$2::text],
         $3::jsonb,
         true
       ),
       updated_at = now();`,
      [String(tenantId), normalizedProvider, JSON.stringify(providerConfig)]
    );

    logger.info(
      `🔑 [ByokService] Saved BYOK key for tenant ${tenantId} [provider: ${normalizedProvider}]`
    );

    return {
      provider: normalizedProvider,
      enabled: Boolean(enabled),
      keyMask,
      defaultModel,
      hasKey: true,
      updatedAt: now,
    };
  } catch (error) {
    logger.error(
      `[ByokService] Error saving BYOK key for ${tenantId}: ${error.message}`
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to save provider key'
    );
  }
};

/**
 * Deletes a BYOK provider key for a tenant.
 */
const deleteTenantByokKey = async ({ tenantId, provider }) => {
  if (!tenantId || !provider) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenantId and provider are required'
    );
  }

  const normalizedProvider = String(provider).trim().toLowerCase();
  await ensureTenantsConfigTable();

  try {
    await postgresPool.query(
      `UPDATE copilot.tenants_config
       SET byok_keys = byok_keys - $2::text,
           updated_at = now()
       WHERE tenant_id = $1;`,
      [String(tenantId), normalizedProvider]
    );

    logger.info(
      `🗑️ [ByokService] Deleted BYOK key for tenant ${tenantId} [provider: ${normalizedProvider}]`
    );
    return { success: true, provider: normalizedProvider };
  } catch (error) {
    logger.error(
      `[ByokService] Error deleting BYOK key for ${tenantId}: ${error.message}`
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete provider key'
    );
  }
};

/**
 * Internal method used by Saby Copilot to resolve a decrypted key.
 */
const getDecryptedKeyForTenant = async ({ tenantId, provider }) => {
  if (!tenantId || !provider) return null;
  const normalizedProvider = String(provider).trim().toLowerCase();
  await ensureTenantsConfigTable();

  try {
    const res = await postgresPool.query(
      `SELECT byok_keys->$2 as provider_config
       FROM copilot.tenants_config
       WHERE tenant_id = $1 LIMIT 1;`,
      [String(tenantId), normalizedProvider]
    );

    const configRow = res.rows[0]?.provider_config;
    if (!configRow || !configRow.enabled || !configRow.encryptedKey) {
      return null;
    }

    const decrypted = decryptSecret(configRow.encryptedKey);
    if (!decrypted) return null;

    return {
      provider: normalizedProvider,
      apiKey: decrypted,
      defaultModel: configRow.defaultModel || null,
    };
  } catch (error) {
    logger.warn(`[ByokService] Error fetching decrypted key: ${error.message}`);
    return null;
  }
};

/**
 * Performs an HTTPS request probe to verify an API key against the provider.
 */
const makeHttpsProbe = (options, postData = null) =>
  new Promise((resolve) => {
    const started = Date.now();
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const latencyMs = Date.now() - started;
        resolve({
          statusCode: res.statusCode,
          data,
          latencyMs,
          ok: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        error: err.message,
        latencyMs: Date.now() - started,
        ok: false,
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        statusCode: 408,
        error: 'Connection timed out',
        latencyMs: Date.now() - started,
        ok: false,
      });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });

/**
 * Tests an API key with a fast live probe to the vendor endpoint.
 */
const testProviderKey = async ({ provider, apiKey, model = null }) => {
  const normalizedProvider = String(provider || '')
    .trim()
    .toLowerCase();
  const trimmedKey = String(apiKey || '').trim();

  if (!trimmedKey) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'API key is required for testing'
    );
  }

  try {
    if (normalizedProvider === 'openai') {
      // Probe: GET https://api.openai.com/v1/models
      const res = await makeHttpsProbe({
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'User-Agent': 'Saby-BYOK-Verifier/1.0',
        },
      });

      if (res.ok) {
        return {
          success: true,
          provider: 'openai',
          latencyMs: res.latencyMs,
          message: 'OpenAI key verified',
        };
      }
      return {
        success: false,
        provider: 'openai',
        statusCode: res.statusCode,
        error:
          res.statusCode === 401
            ? 'Invalid OpenAI API key'
            : `OpenAI returned status ${res.statusCode}`,
      };
    }

    if (normalizedProvider === 'gemini') {
      // Probe: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
      const res = await makeHttpsProbe({
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models?key=${encodeURIComponent(trimmedKey)}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Saby-BYOK-Verifier/1.0',
        },
      });

      if (res.ok) {
        return {
          success: true,
          provider: 'gemini',
          latencyMs: res.latencyMs,
          message: 'Google Gemini key verified',
        };
      }
      return {
        success: false,
        provider: 'gemini',
        statusCode: res.statusCode,
        error:
          res.statusCode === 400 || res.statusCode === 403
            ? 'Invalid Gemini API key'
            : `Gemini returned status ${res.statusCode}`,
      };
    }

    if (normalizedProvider === 'deepseek') {
      // Probe: GET https://api.deepseek.com/models
      const res = await makeHttpsProbe({
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'User-Agent': 'Saby-BYOK-Verifier/1.0',
        },
      });

      if (res.ok) {
        return {
          success: true,
          provider: 'deepseek',
          latencyMs: res.latencyMs,
          message: 'DeepSeek key verified',
        };
      }
      return {
        success: false,
        provider: 'deepseek',
        statusCode: res.statusCode,
        error:
          res.statusCode === 401
            ? 'Invalid DeepSeek API key'
            : `DeepSeek returned status ${res.statusCode}`,
      };
    }

    if (normalizedProvider === 'claude') {
      // Probe: POST https://api.anthropic.com/v1/messages (1-token ping)
      const postBody = JSON.stringify({
        model: model || 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const res = await makeHttpsProbe(
        {
          hostname: 'api.anthropic.com',
          port: 443,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(postBody),
            'User-Agent': 'Saby-BYOK-Verifier/1.0',
          },
        },
        postBody
      );

      if (res.ok) {
        return {
          success: true,
          provider: 'claude',
          latencyMs: res.latencyMs,
          message: 'Anthropic Claude key verified',
        };
      }
      return {
        success: false,
        provider: 'claude',
        statusCode: res.statusCode,
        error:
          res.statusCode === 401
            ? 'Invalid Anthropic Claude API key'
            : `Claude returned status ${res.statusCode}`,
      };
    }

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Unsupported provider: ${provider}`
    );
  } catch (err) {
    return { success: false, provider: normalizedProvider, error: err.message };
  }
};

module.exports = {
  SUPPORTED_PROVIDERS,
  encryptSecret,
  decryptSecret,
  maskApiKey,
  getTenantByokKeys,
  saveTenantByokKey,
  deleteTenantByokKey,
  getDecryptedKeyForTenant,
  testProviderKey,
};
