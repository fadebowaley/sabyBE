const logger = require('../config/logger');

/**
 * Agent gateway SSE translation (Phase 5). Converts the engine's native
 * EventV2 feed (`GET /api/event` from the opencode server) into the frontend
 * protocol: `progress|token|done|error`.
 *
 * Native payload shape: { id, type, data, durable?, location?, metadata? }
 */

const SSE_PROTOCOL = ['progress', 'token', 'done', 'error', 'reasoning'];
const SSE_STAGES = [
  'thinking',
  'routing',
  'tools',
  'synthesis',
  'approval',
  'executing',
];

const isErrorType = (type) =>
  typeof type === 'string' && /(^|\.)(error|failed)$/i.test(type);

const isTerminalType = (type, data) => {
  if (type === 'session.idle') return true;
  if (type === 'session.status' && data?.status?.type === 'idle') return true;
  if (
    typeof type === 'string' &&
    /(completed|finished|done|complete)$/i.test(type)
  )
    return true;
  return false;
};

const isToolEvent = (event) => {
  const type = event?.type || '';
  if (typeof type === 'string' && /tool|permission|question/i.test(type))
    return true;
  const data = event?.properties || event?.data;
  return Boolean(
    data &&
      (data.tool ||
        data.toolName ||
        data.permission ||
        data.question ||
        data.state === 'running')
  );
};

const partTypeMap = new Map();

const recordPartType = (partId, partType) => {
  if (!partId || !partType) return;
  if (partTypeMap.size > 2000) {
    const firstKey = partTypeMap.keys().next().value;
    partTypeMap.delete(firstKey);
  }
  partTypeMap.set(partId, partType);
};

const extractReasoning = (event) => {
  const data = event?.properties || event?.data || event;

  const partId = data?.partID || data?.partId || data?.part?.id;
  const knownType = partId ? partTypeMap.get(partId) : null;

  if (knownType === 'reasoning') {
    if (typeof data?.delta === 'string' && data.delta.length > 0) {
      return data.delta;
    }
  }

  if (
    data?.field === 'reasoning' &&
    typeof data?.delta === 'string' &&
    data.delta.length > 0
  ) {
    return data.delta;
  }

  if (
    (data?.type === 'reasoning' || data?.part?.type === 'reasoning') &&
    typeof data?.delta === 'string' &&
    data.delta.length > 0
  ) {
    return data.delta;
  }

  return null;
};

const extractText = (event) => {
  const data = event?.properties || event?.data || event;
  const type = event?.type || '';

  const partId = data?.partID || data?.partId || data?.part?.id;
  const knownType = partId ? partTypeMap.get(partId) : null;

  // Suppress reasoning/thinking deltas from being emitted as assistant text
  if (
    knownType === 'reasoning' ||
    data?.field === 'reasoning' ||
    data?.type === 'reasoning' ||
    data?.part?.type === 'reasoning' ||
    data?.partType === 'reasoning'
  ) {
    return null;
  }

  // Handle message.part.delta explicitly
  if (type === 'message.part.delta') {
    if (
      data?.field === 'text' &&
      typeof data?.delta === 'string' &&
      data.delta.length > 0
    ) {
      return data.delta;
    }
    return null;
  }

  if (typeof data?.delta === 'string' && data.delta.length > 0) {
    return data.delta;
  }

  if (type === 'message.part.updated') {
    return null;
  }

  if (
    typeof data?.text === 'string' &&
    data.text.length > 0 &&
    data.text !== '…' &&
    data?.field !== 'reasoning'
  ) {
    return data.text;
  }
  if (typeof data?.content === 'string') return data.content;
  if (Array.isArray(data?.parts)) {
    const text = data.parts
      .filter(
        (part) =>
          part &&
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.type !== 'reasoning'
      )
      .map((part) => part.text)
      .join('');
    if (text.length > 0) return text;
  }
  if (Array.isArray(data?.message?.parts)) {
    const text = data.message.parts
      .filter(
        (part) =>
          part &&
          typeof part.text === 'string' &&
          part.type !== 'reasoning'
      )
      .map((part) => part.text)
      .join('');
    if (text.length > 0) return text;
  }
  if (typeof data?.textParts === 'string') return data.textParts;
  return null;
};

const extractUsage = (event) => {
  const data = event?.properties || event?.data || event;
  const usage =
    data?.usage ||
    event?.usage ||
    data?.summary ||
    event?.summary ||
    null;
  if (!usage || typeof usage !== 'object') return null;
  if ('files' in usage && !('inputTokens' in usage || 'input' in usage)) {
    return null;
  }
  return {
    inputTokens: Number(usage.inputTokens ?? usage.input ?? 0),
    outputTokens: Number(usage.outputTokens ?? usage.output ?? 0),
    model: usage.model || data?.model || null,
    toolCalls: Number(usage.toolCalls ?? 0),
    subagentCalls: Number(usage.subagentCalls ?? 0),
    retries: Number(usage.retries ?? 0),
  };
};

const extractError = (event) => {
  const data = event?.properties || event?.data || event;
  if (isErrorType(event?.type)) {
    if (typeof event?.error === 'string') return event.error;
    return (
      data?.error?.message ||
      data?.error ||
      data?.message ||
      `Engine error (${event?.type})`
    );
  }
  if (typeof data?.error === 'string') return data.error;
  if (data?.error?.message) return data.error.message;
  return null;
};

/**
 * Pure translator. Returns `null` when the event should be filtered out.
 */
const translateEngineEvent = (engineEvent, targetSessionId = null) => {
  if (!engineEvent || typeof engineEvent !== 'object') return null;
  const { type } = engineEvent;
  const data = engineEvent.properties || engineEvent.data || engineEvent;

  // Record part type if this is a part event
  if (type === 'message.part.updated') {
    const part = data?.part;
    if (part?.id && part?.type) {
      recordPartType(part.id, part.type);
    }
  }

  // If a target sessionId is provided, ignore events explicitly bound to other sessions
  const eventSessionId = data?.sessionID || data?.sessionId || null;
  if (targetSessionId && eventSessionId && eventSessionId !== targetSessionId) {
    return null;
  }

  const errorMessage = extractError(engineEvent);
  if (errorMessage) {
    return { type: 'error', error: errorMessage };
  }

  // Check if session has usage or is terminal
  const usage = extractUsage(engineEvent);
  if (usage || isTerminalType(type, data)) {
    return { type: 'done', usage, sessionId: eventSessionId };
  }

  // Stream reasoning token if this is reasoning/thinking content (checked before text!)
  const reasoning = extractReasoning(engineEvent);
  if (reasoning) {
    return {
      type: 'reasoning',
      chunk: reasoning,
      token: reasoning,
      sessionId: eventSessionId,
    };
  }

  // Stream text token if this is actual text content
  const text = extractText(engineEvent);
  if (text) {
    return { type: 'token', token: text, sessionId: eventSessionId };
  }

  // Detect reasoning/thinking progress start
  if (
    data?.field === 'reasoning' ||
    data?.type === 'reasoning' ||
    data?.part?.type === 'reasoning' ||
    (type === 'session.status' && data?.status?.type === 'busy')
  ) {
    return { type: 'progress', stage: 'thinking', sessionId: eventSessionId };
  }

  if (isToolEvent(engineEvent)) {
    return {
      type: 'progress',
      stage: 'tools',
      ...(eventSessionId ? { sessionId: eventSessionId } : {}),
    };
  }

  return {
    type: 'progress',
    stage: null,
    sessionId: eventSessionId,
    detail: { engineType: type },
  };
};

/** Headers/CORS for the SSE response. */
const sseInit = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
};

const writeSse = (res, frame) => {
  if (!frame || !SSE_PROTOCOL.includes(frame.type)) return;
  const lines = [`event: ${frame.type}`, `data: ${JSON.stringify(frame)}`, ''];
  res.write(lines.join('\n'));
};

const endSse = (res) => {
  res.write('data: [DONE]\n\n');
  res.end();
};

/**
 * Keep-alive comment every 20s so proxies/intermediaries don't drop the idle
 * stream. Returns a stop function.
 */
const startKeepAlive = (res, intervalMs = 20000) => {
  const interval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (error) {
      clearInterval(interval);
      logger.warn(`[AgentSse] Keep-alive failed: ${error.message}`);
    }
  }, intervalMs);
  return () => clearInterval(interval);
};

module.exports = {
  SSE_PROTOCOL,
  SSE_STAGES,
  isTerminalType,
  isToolEvent,
  translateEngineEvent,
  extractText,
  extractReasoning,
  extractUsage,
  sseInit,
  writeSse,
  endSse,
  startKeepAlive,
};
