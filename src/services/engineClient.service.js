const logger = require('../config/logger');

/**
 * Agent gateway engine bridge (Phase 5). Thin HTTP client to the opencode
 * server (`@opencode-ai/server` HttpApi) running the governed Saby agent:
 *
 *   POST /api/session                     — create engine session (agent = "saby")
 *   POST /api/session/:id/prompt          — admit a prompt
 *   GET  /api/event                       — SSE feed of native EventV2 payloads
 *
 * The gateway owns JWT auth, quota/BYOK parity, usage metering and SSE
 * translation; this client only moves bytes to/from the engine.
 *
 * Env: SABY_ENGINE_URL (default http://127.0.0.1:3456), SABY_ENGINE_TOKEN (optional bearer).
 */

const DEFAULT_ENGINE_URL = 'http://127.0.0.1:3456';
const SABY_AGENT_ID = 'saby';

const engineConfig = () => ({
  baseUrl: (process.env.SABY_ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/+$/, ''),
  token: process.env.SABY_ENGINE_TOKEN || null,
});

const engineAuthHeader = (token) =>
  token ? `Basic ${Buffer.from(`opencode:${token}`).toString('base64')}` : null;

const engineRequest = async (path, { method = 'GET', body = null } = {}) => {
  const { baseUrl, token } = engineConfig();
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const auth = engineAuthHeader(token);
  if (auth) headers.Authorization = auth;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Engine request failed ${response.status} ${path}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  return payload?.data ?? payload;
};

/**
 * Creates an engine session for the saby agent. Optional `byok` carries the
 * user-selected provider key (and provider/model) so the engine can honor it
 * for that session's model calls instead of the default Saby key.
 */
const createSession = async ({ agent = SABY_AGENT_ID, model = null, metadata = null, byok = null } = {}) => {
  const session = await engineRequest('/api/session', {
    method: 'POST',
    body: {
      agent,
      // Top-level `model` must be a Model.Ref({id,providerID}) or null. When a
      // BYOK session carries its model inside metadata.byok (handled by the
      // engine's BYOK-aware resolve()), omit the top-level model.
      model: byok ? undefined : undefined,
      metadata: byok
        ? { ...(metadata || {}), byok: { apiKey: byok.apiKey, provider: byok.provider || null, model: byok.model || null } }
        : metadata || undefined,
    },
  });
  return { sessionId: session?.id };
};

/**
 * Admits a user prompt into an existing engine session. Resolves once the
 * message is durably admitted; streaming continues over /api/event.
 */
const prompt = async ({ sessionId, promptText, delivery = 'steer' }) => {
  await engineRequest(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST',
    body: { prompt: { text: promptText }, delivery },
  });
  return { admitted: true, sessionId };
};

const parseSse = (text) => {
  const frames = [];
  let data = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      data.push(line.replace(/^data:\s*/, ''));
      continue;
    }
    if (line.trim() === '' && data.length > 0) {
      const raw = data.join('\n');
      data = [];
      if (raw === '[DONE]') {
        frames.push({ type: 'done' });
        continue;
      }
      try {
        frames.push(JSON.parse(raw));
      } catch (error) {
        logger.warn(`[EngineClient] Skipped malformed SSE frame: ${error.message}`);
      }
    }
  }
  return frames;
};

const getAfterParam = (after) => (after ? `?after=${encodeURIComponent(after)}` : '');

/**
 * Subscribes to the engine's native event feed and invokes `onEvent` for each
 * parsed EventV2 payload. Resolves when the client-provided `signal` aborts or
 * the stream ends. Returns the count of events observed and the last event id.
 */
const streamEvents = async ({ after = null, onEvent, signal }) => {
  const { baseUrl, token } = engineConfig();
  const headers = { Accept: 'text/event-stream' };
  const auth = engineAuthHeader(token);
  if (auth) headers.Authorization = auth;

  const response = await fetch(`${baseUrl}/api/event${getAfterParam(after)}`, { headers, signal });
  if (!response.ok) throw new Error(`Engine event stream failed ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Engine event stream has no readable body');

  const decoder = new TextDecoder();
  let buffer = '';
  let observed = 0;
  let lastId = after;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frameText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const frame of parseSse(frameText)) {
        if (frame.type === 'done') {
          observed += 1;
          continue;
        }
        if (frame && typeof frame === 'object') {
          lastId = frame.id || frame.sequence || lastId;
          observed += 1;
          onEvent?.(frame);
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  return { observed, lastId };
};

/**
 * Convenience: create a session, admit a prompt, and stream events until the
 * run completes (or the caller aborts). Returns final usage tallies.
 */
const createRun = async ({
  promptText,
  model = null,
  metadata = null,
  byok = null,
  onEvent = null,
  signal = null,
  onProgress = null,
}) => {
  const started = Date.now();
  const { sessionId } = await createSession({ agent: SABY_AGENT_ID, model, metadata, byok });
  await prompt({ sessionId, promptText });

  const tokenTally = { sessionId, startedAt: new Date().toISOString(), inputTokens: 0, outputTokens: 0 };
  onProgress?.(tokenTally);

  await streamEvents({ after: null, onEvent, signal });
  tokenTally.durationMs = Date.now() - started;
  tokenTally.endedAt = new Date().toISOString();
  return tokenTally;
};

module.exports = {
  SABY_AGENT_ID,
  createSession,
  prompt,
  streamEvents,
  parseSse,
  createRun,
};