const logger = require('../config/logger');

/**
 * Agent gateway SSE translation (Phase 5). Converts the engine's native
 * EventV2 feed (`GET /api/event` from the opencode server) into the frontend
 * protocol: `progress|token|done|error`.
 *
 * Native payload shape: { id, type, data, durable?, location?, metadata? }
 */

const SSE_PROTOCOL = ['progress', 'token', 'done', 'error'];
const SSE_STAGES = ['thinking', 'routing', 'tools', 'synthesis', 'approval', 'executing'];

const isErrorType = (type) => typeof type === 'string' && /(^|\\.)error$/i.test(type);

const isTerminalType = (type) =>
  typeof type === 'string' && /(completed|finished|done|complete)$/i.test(type);

const isToolEvent = (event) => {
  const type = event?.type || '';
  if (typeof type === 'string' && /tool|permission|question/i.test(type)) return true;
  const data = event?.data;
  return Boolean(
    data && (data.tool || data.toolName || data.permission || data.question || data.state === 'running')
  );
};

const extractText = (event) => {
  const data = event?.data || event;
  if (typeof data?.text === 'string' && data.text.length > 0 && data.text !== '…') {
    return data.text;
  }
  if (typeof data?.content === 'string') return data.content;
  if (Array.isArray(data?.parts)) {
    const text = data.parts
      .filter((part) => part && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (text.length > 0) return text;
  }
  if (Array.isArray(data?.message?.parts)) {
    const text = data.message.parts
      .filter((part) => part && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (text.length > 0) return text;
  }
  if (typeof data?.textParts === 'string') return data.textParts;
  return null;
};

const extractUsage = (event) => {
  const usage = event?.data?.usage || event?.data?.summary || event?.summary || null;
  if (!usage || typeof usage !== 'object') return null;
  return {
    inputTokens: Number(usage.inputTokens ?? usage.input ?? 0),
    outputTokens: Number(usage.outputTokens ?? usage.output ?? 0),
    model: usage.model || event?.data?.model || null,
    toolCalls: Number(usage.toolCalls ?? 0),
    subagentCalls: Number(usage.subagentCalls ?? 0),
    retries: Number(usage.retries ?? 0),
  };
};

const extractError = (event) => {
  const data = event?.data || event;
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
const translateEngineEvent = (engineEvent) => {
  if (!engineEvent || typeof engineEvent !== 'object') return null;
  const type = engineEvent.type;

  const errorMessage = extractError(engineEvent);
  if (errorMessage) {
    return { type: 'error', error: errorMessage };
  }

  const usage = extractUsage(engineEvent);
  if (usage || isTerminalType(type)) {
    return { type: 'done', usage, sessionId: engineEvent.data?.sessionID || null };
  }

  const text = extractText(engineEvent);
  if (text) {
    return { type: 'token', token: text, sessionId: engineEvent.data?.sessionID || null };
  }

  if (isToolEvent(engineEvent)) {
    return { type: 'progress', stage: 'tools' };
  }

  return {
    type: 'progress',
    stage: null,
    sessionId: engineEvent.data?.sessionID || null,
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
  translateEngineEvent,
  extractText,
  extractUsage,
  sseInit,
  writeSse,
  endSse,
  startKeepAlive,
};