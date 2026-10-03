const logger = require('../config/logger');
const agentSse = require('./agentSse.service');

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
  baseUrl: (process.env.SABY_ENGINE_URL || DEFAULT_ENGINE_URL).replace(
    /\/+$/,
    ''
  ),
  token: process.env.SABY_ENGINE_TOKEN || null,
});

const engineAuthHeader = (token) =>
  token ? `Basic ${Buffer.from(`opencode:${token}`).toString('base64')}` : null;

const engineRequest = async (path, { method = 'GET', body = null } = {}) => {
  const { baseUrl, token } = engineConfig();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const auth = engineAuthHeader(token);
  if (auth) headers.Authorization = auth;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Engine request failed ${response.status} ${path}: ${detail.slice(
        0,
        300
      )}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Engine request returned non-JSON (${contentType}) ${
        response.status
      } ${baseUrl}${path}: ${text.slice(0, 200)}`
    );
  }

  const payload = await response.json();
  return payload?.data ?? payload;
};

const mapProviderID = (raw) => {
  if (!raw) return null;
  const p = String(raw).toLowerCase();
  if (p === 'claude') return 'anthropic';
  if (p === 'gemini') return 'google';
  return p;
};

/**
 * Creates an engine session for the saby agent. Optional `byok` carries the
 * user-selected provider key (and provider/model) so the engine can honor it
 * for that session's model calls instead of the default Saby key.
 */
const createSession = async ({
  agent = SABY_AGENT_ID,
  model = null,
  metadata = null,
  byok = null,
} = {}) => {
  let modelID = byok?.model || model || null;
  let providerID = mapProviderID(byok?.provider);
  if (modelID && modelID.includes('/')) {
    const parts = modelID.split('/');
    providerID = mapProviderID(parts[0]) || parts[0];
    modelID = parts.slice(1).join('/');
  }
  const modelRef = providerID && modelID ? { modelID, providerID } : undefined;

  const session = await engineRequest('/session', {
    method: 'POST',
    body: {
      agent,
      ...(modelRef
        ? {
            model: {
              id: modelRef.modelID,
              providerID: modelRef.providerID,
            },
          }
        : {}),
      metadata: byok
        ? {
            ...(metadata || {}),
            byok: {
              apiKey: byok.apiKey,
              provider: providerID || byok.provider,
              model: modelID,
            },
          }
        : metadata || undefined,
    },
  });
  return { sessionId: session?.id };
};

/**
 * Admits a user prompt into an existing engine session. Resolves once the
 * message is durably admitted; streaming continues over /api/event.
 */
const prompt = async ({ sessionId, promptText, model = null, byok = null }) => {
  let modelID = byok?.model || model || null;
  let providerID = mapProviderID(byok?.provider);
  if (modelID && modelID.includes('/')) {
    const parts = modelID.split('/');
    providerID = mapProviderID(parts[0]) || parts[0];
    modelID = parts.slice(1).join('/');
  }
  const modelRef = providerID && modelID ? { modelID, providerID } : undefined;

  await engineRequest(
    `/session/${encodeURIComponent(sessionId)}/prompt_async`,
    {
      method: 'POST',
      body: {
        parts: [{ type: 'text', text: promptText }],
        ...(modelRef
          ? {
              model: {
                modelID: modelRef.modelID,
                providerID: modelRef.providerID,
              },
            }
          : {}),
      },
    }
  );
  return { admitted: true, sessionId };
};

const parseSse = (text) => {
  const frames = [];
  let data = [];
  text.split('\n').forEach((line) => {
    if (line.startsWith('data:')) {
      data.push(line.replace(/^data:\s*/, ''));
    } else if (line.trim() === '' && data.length > 0) {
      const raw = data.join('\n');
      data = [];
      if (raw === '[DONE]') {
        frames.push({ type: 'done' });
      } else {
        try {
          frames.push(JSON.parse(raw));
        } catch (error) {
          logger.warn(
            `[EngineClient] Skipped malformed SSE frame: ${error.message}`
          );
        }
      }
    }
  });
  if (data.length > 0) {
    const raw = data.join('\n');
    if (raw === '[DONE]') {
      frames.push({ type: 'done' });
    } else {
      try {
        frames.push(JSON.parse(raw));
      } catch (error) {
        logger.warn(
          `[EngineClient] Skipped malformed SSE frame: ${error.message}`
        );
      }
    }
  }
  return frames;
};

const getAfterParam = (after) =>
  after ? `?after=${encodeURIComponent(after)}` : '';

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

  const response = await fetch(`${baseUrl}/event${getAfterParam(after)}`, {
    headers,
    signal,
  });
  if (!response.ok)
    throw new Error(`Engine event stream failed ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Engine event stream has no readable body');

  const decoder = new TextDecoder();
  let buffer = '';
  const state = { observed: 0, lastId: after };
  const processFrame = (frame) => {
    if (frame.type === 'done') {
      state.observed += 1;
    } else if (frame && typeof frame === 'object') {
      state.lastId = frame.id || frame.sequence || state.lastId;
      state.observed += 1;
      onEvent?.(frame);
    }
  };

  try {
    /* eslint-disable no-await-in-loop, no-constant-condition */
    while (true) {
      if (signal?.aborted) {
        logger.info('[streamEvents EXIT] signal.aborted is true');
        break;
      }
      const { value, done } = await reader.read();
      if (done) {
        logger.info('[streamEvents EXIT] reader.read() done=true');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frameText = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parseSse(frameText).forEach(processFrame);
        boundary = buffer.indexOf('\n\n');
      }
    }
    /* eslint-enable no-await-in-loop, no-constant-condition */
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') {
      return state;
    }
    throw error;
  }

  return state;
};

/**
 * Convenience: create a session, admit a prompt, and stream events until the
 * run completes (or the caller aborts). Returns final usage tallies.
 */
const createRun = async ({
  promptText,
  model = null,
  sessionId = null,
  metadata = null,
  byok = null,
  onEvent = null,
  signal = null,
  onProgress = null,
}) => {
  const started = Date.now();
  let activeSessionId = sessionId;

  if (!activeSessionId) {
    const session = await createSession({
      agent: SABY_AGENT_ID,
      model,
      metadata,
      byok,
    });
    activeSessionId = session.sessionId;
  }

  let armed = false;
  let hasStarted = false;

  const wrappedOnEvent = (event) => {
    const data = event?.properties || event?.data;
    const type = event?.type;
    const eventSid = data?.sessionID || data?.sessionId || null;

    if (activeSessionId && eventSid && eventSid !== activeSessionId) {
      return;
    }

    if (
      (type === 'session.status' && data?.status?.type === 'busy') ||
      type === 'message.part.delta' ||
      (type === 'message.updated' &&
        (data?.info?.role === 'assistant' || data?.role === 'assistant')) ||
      (type === 'message.part.updated' &&
        (data?.part?.role === 'assistant' || data?.role === 'assistant')) ||
      agentSse.isToolEvent(event)
    ) {
      hasStarted = true;
    }

    if (agentSse.isTerminalType(type, data)) {
      if (!armed || !hasStarted) {
        return;
      }
    }

    onEvent?.(event, activeSessionId);
  };

  // Connect to the event feed BEFORE admitting the prompt to guarantee no events are missed
  const streamPromise = streamEvents({
    after: null,
    onEvent: wrappedOnEvent,
    signal,
  });

  try {
    await prompt({ sessionId: activeSessionId, promptText, model, byok });
    armed = true;
  } catch (error) {
    // If the existing session was stale or not found in OpenCode, recover by creating a fresh session
    if (
      sessionId &&
      (error.message.includes('404') ||
        error.message.includes('not found') ||
        error.message.includes('Session'))
    ) {
      logger.warn(
        `[EngineClient] Session ${sessionId} stale or missing, recreating session: ${error.message}`
      );
      const fresh = await createSession({
        agent: SABY_AGENT_ID,
        model,
        metadata,
        byok,
      });
      activeSessionId = fresh.sessionId;
      await prompt({ sessionId: activeSessionId, promptText, model, byok });
      armed = true;
    } else {
      throw error;
    }
  }

  const tokenTally = {
    sessionId: activeSessionId,
    startedAt: new Date().toISOString(),
    inputTokens: 0,
    outputTokens: 0,
  };
  onProgress?.(tokenTally);

  await streamPromise;
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
