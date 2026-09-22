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

const estimateTokens = (text) => Math.max(0, Math.round((text || '').length / 4));

const runId = () => `run_${crypto.randomBytes(9).toString('hex')}`;

const identity = (req) => ({
  tenantId: req.user?.tenantId,
  userId: String(req.user?.id || req.user?._id || ''),
  isSaby: Boolean(req.user?.isSaby),
});

const isExempt = ({ isSaby, byokProvider, balance }) =>
  isSaby || Boolean(byokProvider) || Boolean(balance?.isUnlimited);

/**
 * POST /agent/chat — SSE streaming chat against the Saby agent engine.
 */
const chat = async (req, res) => {
  const { message, threadId = null, model = null, title = null } = req.body || {};
  const { tenantId, userId, isSaby } = identity(req);
  const byokHeaderKey = req.get('x-ai-api-key') || null;
  const run = runId();

  let quota;
  try {
    quota = await agentQuotaService.assertQuota({ tenantId, isSaby, byokHeaderKey });
  } catch (error) {
    return res.status(error.statusCode || httpStatus.PAYMENT_REQUIRED).send({
      status: 'error',
      message: error.message,
      code: error.details?.reason || 'insufficient_quota',
    });
  }

  if (!tenantId) {
    return res.status(httpStatus.BAD_REQUEST).send({ status: 'error', message: 'Missing tenant.' });
  }

  let thread;
  try {
    thread = threadId
      ? await agentThreadService.getThread({ tenantId, threadId })
      : await agentThreadService.createThread({ tenantId, userId, title });
  } catch (error) {
    return res
      .status(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR)
      .send({ status: 'error', message: error.message });
  }

  agentSse.sseInit(res);
  const stopKeepAlive = agentSse.startKeepAlive(res);

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let assistantText = '';
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
        metadata: { engineSessionId, byokProvider: quota?.byokProvider || null, mode: quota?.mode || null },
      });

      if (quotaConsumed > 0 && !isExempt({ isSaby, byokProvider: quota?.byokProvider, balance: quota?.balance })) {
        await aiTokenService.deductAiUsage({
          tenantId,
          tokens: quotaConsumed,
          isUnlimited: Boolean(quota?.balance?.isUnlimited),
        });
      }
    } catch (error) {
      logger.error(`[AgentGateway] Finalization failed for run ${run}: ${error.message}`);
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
    safeWrite({ type: 'error', error: error.message || 'thread_append_failed' });
    await finalize();
    return;
  }

  safeWrite({ type: 'progress', stage: 'thinking' });

  try {
    const tally = await engineClient.createRun({
      promptText: message,
      model,
      byok: byokHeaderKey
        ? { apiKey: byokHeaderKey, provider: quota?.byokProvider || null, model: model || null }
        : null,
      metadata: { threadId: thread.threadId, tenantId, userId, runId: run },
      signal: controller.signal,
      onEvent: (engineEvent) => {
        const frame = agentSse.translateEngineEvent(engineEvent);
        if (!frame) return;
        if (frame.type === 'token' && frame.token) {
          assistantText += frame.token;
          outputTokens = Math.round(assistantText.length / 4);
          safeWrite({ type: 'token', token: frame.token });
          return;
        }
        if (frame.type === 'done') {
          finalUsage = frame.usage || finalUsage;
          return;
        }
        safeWrite(frame);
      },
    });

    finalUsage = {
      ...(finalUsage || {}),
      inputTokens: Number(finalUsage?.inputTokens ?? inputTokens),
      outputTokens: Number(finalUsage?.outputTokens ?? outputTokens),
      toolCalls: Number(finalUsage?.toolCalls ?? toolCalls),
      subagentCalls: Number(finalUsage?.subagentCalls ?? subagentCalls),
      retries: Number(finalUsage?.retries ?? retries),
      model: finalUsage?.model || model || null,
      durationMs: tally.durationMs || 0,
    };

    safeWrite({
      type: 'done',
      usage: {
        inputTokens: Number(finalUsage?.inputTokens ?? inputTokens),
        outputTokens: Number(finalUsage?.outputTokens ?? outputTokens),
        toolCalls: Number(finalUsage?.toolCalls ?? toolCalls),
        subagentCalls: Number(finalUsage?.subagentCalls ?? subagentCalls),
        retries: Number(finalUsage?.retries ?? retries),
        model: finalUsage?.model || model || null,
        runId: run,
        durationMs: tally.durationMs || 0,
      },
    });
  } catch (error) {
    safeWrite({ type: 'error', error: error.message || 'engine_error' });
  } finally {
    await finalize();
  }
};

const listThreads = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { page, limit } = req.query || {};
  const result = await agentThreadService.listThreads({ tenantId, page, limit });
  res.status(httpStatus.OK).send({ status: 'success', data: result });
});

const createThread = catchAsync(async (req, res) => {
  const { tenantId, userId } = identity(req);
  const { title, model } = req.body || {};
  const thread = await agentThreadService.createThread({ tenantId, userId, title });
  res.status(httpStatus.CREATED).send({ status: 'success', data: thread, model: model || null });
});

const getThread = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { threadId } = req.params;
  const { limit } = req.query || {};
  const thread = await agentThreadService.getThreadWithMessages({ tenantId, threadId, limit });
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
  const { tenantId, isSaby } = identity(req);
  if (!isSaby) {
    return res
      .status(httpStatus.FORBIDDEN)
      .send({ status: 'error', message: 'Token credit requires a Saby superuser.' });
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
    balance: await aiTokenService.getTenantAiBalance({ tenantId: targetTenantId, isSaby }),
  });
});

const getUsage = catchAsync(async (req, res) => {
  const { tenantId } = identity(req);
  const { page, limit } = req.query || {};
  const result = await agentUsageService.listUsage({ tenantId, page, limit });
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
};