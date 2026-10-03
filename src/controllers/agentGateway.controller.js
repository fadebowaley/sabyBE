const crypto = require('crypto');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const aiTokenService = require('../services/aiToken.service');
const agentQuotaService = require('../services/agentQuota.service');
const agentThreadService = require('../services/agentThread.service');
const agentUsageService = require('../services/agentUsage.service');
const engineClient = require('../services/engineClient.service');
const agentSse = require('../services/agentSse.service');

/**
 * Agent gateway controller (Phase 5). Owns the streaming chat endpoint that
 * bridges the caller's Express request to the governed Saby agent engine and
 * the durable thread/usage/quota plumbing around it.
 */

const engineEnabled = () => process.env.SABY_ENGINE_ENABLED === 'true';

const estimateTokens = (text) =>
  Math.max(0, Math.round((text || '').length / 4));

const runId = () => `run_${crypto.randomBytes(9).toString('hex')}`;

const identity = (req) => ({
  tenantId: req.user?.tenantId,
  userId: String(req.user?.id || req.user?._id || ''),
  isSaby: Boolean(req.user?.isSaby),
});

const isExempt = ({ isSaby, byokProvider, balance }) =>
  isSaby || Boolean(byokProvider) || Boolean(balance?.isUnlimited);

const normalizeModel = (model) => {
  if (!model || typeof model !== 'string')
    return 'opencode-go/deepseek-v4-flash';
  const m = model.toLowerCase().trim();
  if (
    m === 'flash' ||
    m.includes('flash') ||
    m.includes('deepseek') ||
    m.includes('opencode') ||
    m.includes('go') ||
    m.includes('pickle') ||
    m.includes('saby')
  ) {
    if (m.includes('pro')) return 'opencode-go/deepseek-v4-pro';
    return 'opencode-go/deepseek-v4-flash';
  }
  if (m.includes('gemini')) return 'gemini-3.6-flash';
  if (m.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (m.includes('gpt-4o') || m.includes('openai')) return 'gpt-4o';
  if (m.includes('haiku')) return 'claude-3-5-haiku-20241022';
  if (m.includes('claude') || m.includes('sonnet'))
    return 'claude-3-5-sonnet-20241022';
  return model.trim();
};

/**
 * POST /agent/chat — SSE streaming chat against the Saby agent engine.
 */
const chat = async (req, res) => {
  const {
    message,
    threadId = null,
    model = null,
    title = null,
    context = null,
  } = req.body || {};
  const rawModel = model || context?.modelPreference || null;
  const requestedModel = normalizeModel(rawModel);
  const { tenantId, userId, isSaby } = identity(req);
  const byokHeaderKey = req.get('x-ai-api-key') || null;
  const run = runId();

  // Auto-resolve tenant BYOK key based on requested model or enabled tenant keys
  const resolvedByok = await agentQuotaService.resolveTenantByok({
    tenantId,
    model: requestedModel || rawModel,
    headerKey: byokHeaderKey,
  });

  let quota;
  try {
    quota = await agentQuotaService.assertQuota({
      tenantId,
      isSaby,
      byokHeaderKey,
      byokProvider: resolvedByok?.provider || null,
      model: requestedModel || rawModel,
    });
  } catch (error) {
    return res.status(error.statusCode || httpStatus.PAYMENT_REQUIRED).send({
      status: 'error',
      message: error.message,
      code: error.details?.reason || 'insufficient_quota',
    });
  }

  if (!tenantId) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .send({ status: 'error', message: 'Missing tenant.' });
  }

  let thread;
  try {
    const derivedTitle =
      (title && title.trim()) ||
      (message && message.length > 50 ? `${message.slice(0, 47)}...` : message) ||
      'New conversation';

    if (threadId) {
      try {
        thread = await agentThreadService.getThread({ tenantId, threadId });
      } catch (err) {
        if (
          err.statusCode === httpStatus.NOT_FOUND ||
          err.status === 404 ||
          String(err.message || '')
            .toLowerCase()
            .includes('not found')
        ) {
          thread = await agentThreadService.createThread({
            tenantId,
            userId,
            threadId,
            title: derivedTitle,
          });
        } else {
          throw err;
        }
      }
    } else {
      thread = await agentThreadService.createThread({
        tenantId,
        userId,
        title: derivedTitle,
      });
    }
  } catch (error) {
    return res
      .status(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR)
      .send({ status: 'error', message: error.message });
  }

  agentSse.sseInit(res);
  const stopKeepAlive = agentSse.startKeepAlive(res);

  const controller = new AbortController();
  req.on('close', () => {
    logger.info('[AgentGateway ABORT] req.on("close") fired!');
    controller.abort();
  });

  let assistantText = '';
  let assistantReasoning = '';
  let inputTokens = estimateTokens(message);
  let outputTokens = 0;
  let toolCalls = 0;
  let subagentCalls = 0;
  let retries = 0;
  let finalUsage = null;
  let finished = false;

  const finalize = async () => {
    if (finished) return;
    finished = true;
    stopKeepAlive();

    const engineSessionId = thread.engineSessionId || null;
    const usage = finalUsage || {};
    inputTokens = Number(usage.inputTokens ?? inputTokens);
    outputTokens = Number(usage.outputTokens ?? outputTokens);
    toolCalls = Number(usage.toolCalls ?? toolCalls);
    subagentCalls = Number(usage.subagentCalls ?? subagentCalls);
    retries = Number(usage.retries ?? retries);

    try {
      await agentThreadService.appendMessage({
        tenantId,
        threadId: thread.threadId,
        role: 'assistant',
        content: assistantText || '(empty response)',
        inputTokens,
        outputTokens,
        model: usage.model || model || null,
      });

      const quotaConsumed = inputTokens + outputTokens;
      await agentUsageService.recordUsage({
        runId: run,
        tenantId,
        userId,
        threadId: thread.threadId,
        model: usage.model || model || null,
        inputTokens,
        outputTokens,
        toolCalls,
        subagentCalls,
        retries,
        durationMs: 0,
        quotaConsumed,
        metadata: {
          engineSessionId,
          byokProvider: quota?.byokProvider || null,
          mode: quota?.mode || null,
        },
      });

      const exempt = isExempt({
        isSaby,
        byokProvider: quota?.byokProvider,
        balance: quota?.balance,
      });

      if (quotaConsumed > 0) {
        await aiTokenService.deductAiUsage({
          tenantId,
          userId,
          runId: run,
          threadId: thread.threadId,
          model: usage.model || model || null,
          tokens: quotaConsumed,
          inputTokens,
          outputTokens,
          action: 'agent_chat',
          isUnlimited: exempt,
        });
      }
    } catch (error) {
      logger.error(
        `[AgentGateway] Finalization failed for run ${run}: ${error.message}`
      );
    }
    try {
      agentSse.endSse(res);
    } catch (error) {
      /* stream already closed by caller */
    }
  };

  if (!engineEnabled()) {
    try {
      agentSse.writeSse(res, {
        type: 'progress',
        stage: 'routing',
        message: 'Saby engine is not enabled on this runtime yet.',
      });
      agentSse.writeSse(res, { type: 'error', error: 'SABY_ENGINE_DISABLED' });
    } finally {
      await finalize();
    }
    return;
  }

  const safeWrite = (frame) => {
    try {
      agentSse.writeSse(res, frame);
    } catch (error) {
      controller.abort();
    }
  };

  try {
    await agentThreadService.appendMessage({
      tenantId,
      threadId: thread.threadId,
      role: 'user',
      content: message,
      inputTokens,
      outputTokens: 0,
      model: model || null,
    });
  } catch (error) {
    safeWrite({
      type: 'error',
      error: error.message || 'thread_append_failed',
    });
    await finalize();
    return;
  }

  safeWrite({ type: 'progress', stage: 'thinking' });

  let hasError = false;
  try {
    const activeModel =
      requestedModel || normalizeModel(resolvedByok?.defaultModel) || null;
    const existingSessionId = thread.engineSessionId || null;
    const tally = await engineClient.createRun({
      promptText: message,
      model: activeModel,
      sessionId: existingSessionId,
      byok: resolvedByok
        ? {
            apiKey: resolvedByok.apiKey,
            provider: resolvedByok.provider,
            model: activeModel,
          }
        : null,
      metadata: { threadId: thread.threadId, tenantId, userId, runId: run },
      signal: controller.signal,
      onEvent: (engineEvent, activeSessionId) => {
        const frame = agentSse.translateEngineEvent(
          engineEvent,
          activeSessionId || existingSessionId
        );
        logger.info(
          `[AgentGateway EVENT] engine=${engineEvent?.type} frame=${frame?.type} sid=${engineEvent?.data?.sessionID}`
        );
        if (!frame) return;
        if (frame.type === 'token' && frame.token) {
          assistantText += frame.token;
          outputTokens = Math.round(
            (assistantText.length + assistantReasoning.length) / 4
          );
          safeWrite({ type: 'token', token: frame.token, chunk: frame.token });
          return;
        }
        if (frame.type === 'reasoning' && frame.chunk) {
          assistantReasoning += frame.chunk;
          safeWrite({
            type: 'reasoning',
            chunk: frame.chunk,
            token: frame.chunk,
          });
          return;
        }
        if (frame.type === 'done') {
          logger.info('[AgentGateway ABORT] frame.type === done received');
          finalUsage = frame.usage || finalUsage;
          controller.abort();
          return;
        }
        if (frame.type === 'error') {
          if (assistantText.trim().length > 0) {
            logger.warn(
              `[AgentGateway] Trailing stream error ignored since answer was generated: ${frame.error}`
            );
            finalUsage = frame.usage || finalUsage;
            controller.abort();
            return;
          }
          hasError = true;
          logger.info(
            `[AgentGateway ABORT] frame.type === error: ${frame.error}`
          );
          safeWrite(frame);
          controller.abort();
          return;
        }
        safeWrite(frame);
      },
    });

    if (tally?.sessionId && tally.sessionId !== existingSessionId) {
      thread.engineSessionId = tally.sessionId;
      await agentThreadService
        .setEngineSessionId({
          tenantId,
          threadId: thread.threadId,
          engineSessionId: tally.sessionId,
        })
        .catch((err) =>
          logger.warn(
            `[AgentGateway] Could not persist engineSessionId: ${err.message}`
          )
        );
    }

    if (!hasError) {
      finalUsage = {
        ...(finalUsage || {}),
        inputTokens: Number(finalUsage?.inputTokens ?? inputTokens),
        outputTokens: Number(finalUsage?.outputTokens ?? outputTokens),
        toolCalls: Number(finalUsage?.toolCalls ?? toolCalls),
        subagentCalls: Number(finalUsage?.subagentCalls ?? subagentCalls),
        retries: Number(finalUsage?.retries ?? retries),
        model: finalUsage?.model || activeModel || rawModel || null,
        durationMs: tally?.durationMs || 0,
      };

      safeWrite({
        type: 'done',
        answer: assistantText,
        reasoning: assistantReasoning,
        threadId: thread.threadId,
        usage: {
          inputTokens: Number(finalUsage?.inputTokens ?? inputTokens),
          outputTokens: Number(finalUsage?.outputTokens ?? outputTokens),
          toolCalls: Number(finalUsage?.toolCalls ?? toolCalls),
          subagentCalls: Number(finalUsage?.subagentCalls ?? subagentCalls),
          retries: Number(finalUsage?.retries ?? retries),
          model: finalUsage?.model || activeModel || rawModel || null,
          runId: run,
          durationMs: tally?.durationMs || 0,
        },
      });
    }
  } catch (error) {
    if (!hasError && !controller.signal.aborted) {
      safeWrite({ type: 'error', error: error.message || 'engine_error' });
    }
  } finally {
    await finalize();
  }
};

const listThreads = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { page, limit } = req.query || {};
  const result = await agentThreadService.listThreads({
    tenantId,
    page,
    limit,
  });
  res.status(httpStatus.OK).send({ status: 'success', data: result });
});

const createThread = catchAsync(async (req, res) => {
  const { tenantId, userId } = identity(req);
  const { threadId, title, preview, turns, metadata, model } = req.body || {};
  const meta = { ...(metadata || {}) };
  if (preview) meta.preview = preview;
  const thread = await agentThreadService.createThread({
    tenantId,
    userId,
    threadId: threadId || null,
    title: title || 'New conversation',
    metadata: meta,
  });

  if (Array.isArray(turns) && turns.length > 0) {
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      if (turn && (turn.text || turn.content)) {
        await agentThreadService
          .appendMessage({
            tenantId,
            threadId: thread.threadId,
            role: turn.role === 'assistant' ? 'assistant' : 'user',
            content: turn.text || turn.content || '',
            model: model || null,
          })
          .catch(() => null);
      }
    }
  }

  res
    .status(httpStatus.CREATED)
    .send({ status: 'success', data: thread, model: model || null });
});

const getThread = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { threadId } = req.params;
  const { limit } = req.query || {};
  const thread = await agentThreadService.getThreadWithMessages({
    tenantId,
    threadId,
    limit,
  });
  res.status(httpStatus.OK).send({ status: 'success', data: thread });
});

const deleteThread = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { threadId } = req.params;
  const result = await agentThreadService.deleteThread({ tenantId, threadId });
  res.status(httpStatus.OK).send({ status: 'success', data: result });
});

const getBalance = catchAsync(async (req, res) => {
  const { tenantId, isSaby } = identity(req);
  const balance = await aiTokenService.getTenantAiBalance({ tenantId, isSaby });
  res.status(httpStatus.OK).send({ status: 'success', data: balance });
});

const creditTokens = catchAsync(async (req, res) => {
  const { isSaby } = identity(req);
  if (!isSaby) {
    return res.status(httpStatus.FORBIDDEN).send({
      status: 'error',
      message: 'Token credit requires a Saby superuser.',
    });
  }
  const { targetTenantId, tokens, isUnlimited, reason } = req.body || {};
  const result = await aiTokenService.allocateTokensManually({
    actorUser: req.user,
    targetTenantId,
    tokens,
    isUnlimited,
    reason,
  });
  res.status(httpStatus.OK).send({
    status: 'success',
    data: result,
    balance: await aiTokenService.getTenantAiBalance({
      tenantId: targetTenantId,
      isSaby,
    }),
  });
});

const getUsage = catchAsync(async (req, res) => {
  const { tenantId, userId: callerId } = identity(req);
  const { page, limit, userId } = req.query || {};
  const isElevated = Boolean(
    req.user?.isOwner || req.user?.isAdmin || req.user?.isSuper || req.user?.isSaby
  );
  const targetUserId = isElevated ? (userId || null) : callerId;
  const result = await agentUsageService.listUsage({
    tenantId,
    userId: targetUserId,
    page,
    limit,
  });
  res.status(httpStatus.OK).send({ status: 'success', data: result });
});

const getTokenLogs = catchAsync(async (req, res) => {
  const { tenantId, userId: callerId } = identity(req);
  const { page, limit, userId } = req.query || {};
  const isElevated = Boolean(
    req.user?.isOwner || req.user?.isAdmin || req.user?.isSuper || req.user?.isSaby
  );
  const targetUserId = isElevated ? (userId || null) : callerId;
  const result = await aiTokenService.listUserTokenLogs({
    tenantId,
    userId: targetUserId,
    page,
    limit,
  });
  res.status(httpStatus.OK).send({ status: 'success', data: result });
});

module.exports = {
  chat,
  listThreads,
  createThread,
  getThread,
  deleteThread,
  getBalance,
  creditTokens,
  getUsage,
  getTokenLogs,
};
