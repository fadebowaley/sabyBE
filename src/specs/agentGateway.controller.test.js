jest.mock('../middlewares/auth', () => () => (req, res, next) => {
  req.user = { tenantId: 't-1', id: 'u-1', isSaby: false };
  next();
});
jest.mock('../services/agentQuota.service');
jest.mock('../services/agentThread.service');
jest.mock('../services/agentUsage.service');
jest.mock('../services/aiToken.service');
jest.mock('../services/engineClient.service');

const request = require('supertest');
const express = require('express');
const agentRoute = require('../routes/v1/agent.route');
const agentQuotaService = require('../services/agentQuota.service');
const agentThreadService = require('../services/agentThread.service');
const agentUsageService = require('../services/agentUsage.service');
const aiTokenService = require('../services/aiToken.service');
const engineClient = require('../services/engineClient.service');

const ORIGINAL_ENV = process.env;

const app = express();
app.use(express.json());
app.use('/v1/agent', agentRoute);

const thread = { threadId: 'thr-1', engineSessionId: 'sess-1', title: 'Hi' };

describe('agentGateway.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SABY_ENGINE_ENABLED;

    agentQuotaService.assertQuota.mockResolvedValue({
      allowed: true,
      mode: 'regular',
      byokProvider: null,
      balance: { remainingTokens: 100, isUnlimited: false },
    });
    agentThreadService.createThread.mockResolvedValue(thread);
    agentThreadService.getThreadWithMessages.mockResolvedValue({ ...thread, messages: [] });
    agentThreadService.listThreads.mockResolvedValue({ items: [thread], pagination: { total: 1 } });
    agentThreadService.deleteThread.mockResolvedValue({ deleted: true, threadId: 'thr-1' });
    agentThreadService.appendMessage.mockImplementation(async () => '5');
    agentUsageService.recordUsage.mockResolvedValue({});
    agentUsageService.listUsage.mockResolvedValue({ items: [] });
    aiTokenService.getTenantAiBalance.mockResolvedValue({ remainingTokens: 100, isUnlimited: false });
    aiTokenService.deductAiUsage.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('chat streams an error + done when the engine is disabled', async () => {
    const res = await request(app)
      .post('/v1/agent/chat')
      .send({ message: 'hello' })
      .expect(200);

    expect(res.text).toContain('event: error');
    expect(res.text).toContain('SABY_ENGINE_DISABLED');
    expect(res.text).toContain('[DONE]');
    expect(agentThreadService.appendMessage).toHaveBeenCalled();
    expect(agentUsageService.recordUsage).toHaveBeenCalled();
    expect(aiTokenService.deductAiUsage).toHaveBeenCalled();
  });

  test('chat streams tokens and a done summary from the engine', async () => {
    process.env.SABY_ENGINE_ENABLED = 'true';
    engineClient.createRun.mockImplementation(async ({ onEvent }) => {
      onEvent({ id: 'evt_1', type: 'session.message', data: { message: { parts: [{ text: 'Hello' }] } } });
      onEvent({ type: 'session.permission', data: { permission: { id: 'p' } } });
      onEvent({ type: 'session.message.done', data: { usage: { inputTokens: 50 } } });
      return { durationMs: 120 };
    });

    const res = await request(app)
      .post('/v1/agent/chat')
      .send({ message: 'hello' })
      .expect(200);

    expect(res.text).toContain('event: token');
    expect(res.text).toContain('"token":"Hello"');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('"runId":"run_');
    expect(agentUsageService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1', threadId: 'thr-1', inputTokens: 50 })
    );
  });

  test('quota denial returns 402 before streaming', async () => {
    agentQuotaService.assertQuota.mockRejectedValue({
      statusCode: 402,
      message: 'Insufficient AI token quota.',
      details: { reason: 'insufficient_quota' },
    });
    await request(app)
      .post('/v1/agent/chat')
      .send({ message: 'hello' })
      .expect(402)
      .expect((res) => {
        expect(res.body.code).toBe('insufficient_quota');
      });
  });

  test('history threads CRUD works', async () => {
    const listRes = await request(app).get('/v1/agent/history/threads').expect(200);
    expect(listRes.body.data.items).toEqual([thread]);

    const createRes = await request(app).post('/v1/agent/history/threads').send({ title: 'Hi' }).expect(201);
    expect(createRes.body.data.threadId).toBe('thr-1');

    const getRes = await request(app).get('/v1/agent/history/threads/thr-1').expect(200);
    expect(getRes.body.data.messages).toEqual([]);

    await request(app).delete('/v1/agent/history/threads/thr-1').expect(200);
    expect(agentThreadService.deleteThread).toHaveBeenCalledWith({ tenantId: 't-1', threadId: 'thr-1' });
  });

  test('tokens balance and credit endpoints work', async () => {
    const balanceRes = await request(app).get('/v1/agent/tokens/balance').expect(200);
    expect(balanceRes.body.data.remainingTokens).toBe(100);

    const creditRes = await request(app)
      .post('/v1/agent/tokens/credit')
      .send({ targetTenantId: 't-9', tokens: 1000 })
      .expect(403);
    expect(creditRes.body.message).toContain('Saby superuser');
  });
});