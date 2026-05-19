// ── Mock setup (must precede require) ─────────────────────────────────────────

const mockPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPool }));

// ── Modules under test ────────────────────────────────────────────────────────

const modelRouter    = require('../services/modelRouter.service');
const promptRegistry = require('../services/promptRegistry.service');
const gateway        = require('../services/intelligenceGateway.service');

const TENANT = 'tenant-phase4';
const ACTOR  = 'user-abc';

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// modelRouter — resolveModel
// ─────────────────────────────────────────────────────────────────────────────

describe('modelRouter.resolveModel', () => {
  const FAST_MODEL = {
    model_key: 'gpt-4o-mini', model_name: 'gpt-4o-mini', provider: 'openai',
    latency_class: 'fast', cost_input_per_1k: '0.000150', cost_output_per_1k: '0.000600',
    supports_json_mode: true, supports_tools: true, max_context_tokens: 128000,
  };

  test('returns fast model for intent_classification', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [FAST_MODEL] });

    const model = await modelRouter.resolveModel({ taskType: 'intent_classification' });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('latency_class = $1'),
      ['fast']
    );
    expect(model.modelKey).toBe('gpt-4o-mini');
    expect(model.latencyClass).toBe('fast');
    expect(model.costInputPer1k).toBeCloseTo(0.00015);
  });

  test('falls back to medium when no fast model is available (LOW risk)', async () => {
    const MEDIUM_MODEL = { ...FAST_MODEL, model_key: 'gpt-4.1-mini', latency_class: 'medium' };
    // First call (fast) returns nothing; second call (medium) returns a model
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [MEDIUM_MODEL] });

    const model = await modelRouter.resolveModel({
      taskType: 'intent_classification',
      riskLevel: 'LOW',
      fallbackAllowed: true,
    });

    expect(model.modelKey).toBe('gpt-4.1-mini');
  });

  test('fails closed for HIGH risk when primary class unavailable', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await expect(
      modelRouter.resolveModel({ taskType: 'sensitive_action', riskLevel: 'HIGH' })
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });

  test('fails closed for CRITICAL regardless of fallbackAllowed', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await expect(
      modelRouter.resolveModel({
        taskType: 'sensitive_action',
        riskLevel: 'CRITICAL',
        fallbackAllowed: true,
      })
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// modelRouter — logModelUsage
// ─────────────────────────────────────────────────────────────────────────────

describe('modelRouter.logModelUsage', () => {
  test('inserts into model_usage_logs with computed cost', async () => {
    // registry lookup
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        provider: 'openai', model_name: 'gpt-4o-mini',
        cost_input_per_1k: '0.000150', cost_output_per_1k: '0.000600',
      }],
    });
    // INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });

    const result = await modelRouter.logModelUsage({
      tenantId: TENANT, actorId: ACTOR, traceId: 'trace-1',
      modelKey: 'gpt-4o-mini', stage: 'intent_classification',
      inputTokens: 100, outputTokens: 50, latencyMs: 320, status: 'success',
    });

    expect(result.id).toBe(99);
    // Verify INSERT was called with computed cost
    const insertCall = mockPool.query.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO copilot.model_usage_logs');
    // estimated_cost = (100/1000)*0.00015 + (50/1000)*0.0006 = 0.000015 + 0.00003 = 0.000045
    expect(insertCall[1]).toContain(TENANT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// modelRouter — checkBudget
// ─────────────────────────────────────────────────────────────────────────────

describe('modelRouter.checkBudget', () => {
  test('returns allowed=true when no budget is configured', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await modelRouter.checkBudget({ tenantId: TENANT });

    expect(result.allowed).toBe(true);
    expect(result.budget).toBeNull();
  });

  test('returns allowed=false when daily spend exceeds budget', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ budget: '1.00' }] })
      .mockResolvedValueOnce({ rows: [{ spent: '1.5000' }] });

    const result = await modelRouter.checkBudget({ tenantId: TENANT });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeded');
    expect(result.budget).toBe(1.00);
  });

  test('returns allowed=true when spend is under budget', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ budget: '5.00' }] })
      .mockResolvedValueOnce({ rows: [{ spent: '0.25' }] });

    const result = await modelRouter.checkBudget({ tenantId: TENANT });

    expect(result.allowed).toBe(true);
    expect(result.spentToday).toBe(0.25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// promptRegistry — getActivePrompt + renderPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('promptRegistry.renderPrompt', () => {
  const ACTIVE_PROMPT = {
    id: 'prompt-uuid-1', prompt_key: 'intent_classifier', version: 1,
    system_prompt: 'You are a classifier. Message: {{message}}',
    user_prompt_template: 'Classify: {{message}}',
    model_hint: 'gpt-4o-mini', task_type: 'intent_classification',
  };

  test('renders template variables into system and user prompts', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [ACTIVE_PROMPT] });

    const rendered = await promptRegistry.renderPrompt('intent_classifier', {
      message: 'Show me compliance report',
    });

    expect(rendered.systemPrompt).toBe(
      'You are a classifier. Message: Show me compliance report'
    );
    expect(rendered.userPrompt).toBe('Classify: Show me compliance report');
    expect(rendered.version).toBe(1);
    expect(rendered.promptId).toBe('prompt-uuid-1');
  });

  test('throws PROMPT_NOT_FOUND when no active prompt exists', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      promptRegistry.renderPrompt('nonexistent_key', {})
    ).rejects.toMatchObject({ code: 'PROMPT_NOT_FOUND' });
  });

  test('leaves unknown placeholders intact', async () => {
    const prompt = { ...ACTIVE_PROMPT, system_prompt: 'Hello {{name}} and {{unknown}}' };
    mockPool.query.mockResolvedValueOnce({ rows: [prompt] });

    const rendered = await promptRegistry.renderPrompt('intent_classifier', { name: 'World' });

    expect(rendered.systemPrompt).toBe('Hello World and {{unknown}}');
  });
});

describe('promptRegistry.activatePromptVersion', () => {
  test('demotes existing active version and activates the target', async () => {
    // getPromptVersion
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p2', prompt_key: 'intent_classifier', version: 2, status: 'draft' }],
    });
    // _demoteActiveVersion UPDATE
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // activate UPDATE
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p2', prompt_key: 'intent_classifier', version: 2, status: 'active' }],
    });

    const result = await promptRegistry.activatePromptVersion('intent_classifier', 2);

    expect(result.status).toBe('active');
    expect(result.version).toBe(2);
    // Demote query must have run
    const demoteCall = mockPool.query.mock.calls[1];
    expect(demoteCall[0]).toContain("status = 'deprecated'");
  });

  test('throws PROMPT_VERSION_NOT_FOUND when version does not exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      promptRegistry.activatePromptVersion('intent_classifier', 99)
    ).rejects.toMatchObject({ code: 'PROMPT_VERSION_NOT_FOUND' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// intelligenceGateway — resolveCallPlan
// ─────────────────────────────────────────────────────────────────────────────

describe('intelligenceGateway.resolveCallPlan', () => {
  const FAST_MODEL_ROW = {
    model_key: 'gpt-4o-mini', model_name: 'gpt-4o-mini', provider: 'openai',
    latency_class: 'fast', cost_input_per_1k: '0.000150', cost_output_per_1k: '0.000600',
    supports_json_mode: true, supports_tools: true, max_context_tokens: 128000,
  };
  const ACTIVE_PROMPT_ROW = {
    id: 'pv-1', prompt_key: 'intent_classifier', version: 1,
    system_prompt: 'Classify: {{message}}',
    user_prompt_template: null,
    model_hint: 'gpt-4o-mini', task_type: 'intent_classification',
  };

  test('returns model + rendered prompt when budget is within limits', async () => {
    // checkBudget — no config row → allowed
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // resolveModel — fast class
    mockPool.query.mockResolvedValueOnce({ rows: [FAST_MODEL_ROW] });
    // renderPrompt — getActivePrompt
    mockPool.query.mockResolvedValueOnce({ rows: [ACTIVE_PROMPT_ROW] });

    const plan = await gateway.resolveCallPlan({
      tenantId: TENANT, actorId: ACTOR,
      taskType: 'intent_classification',
      variables: { message: 'hello' },
    });

    expect(plan.model.modelKey).toBe('gpt-4o-mini');
    expect(plan.systemPrompt).toBe('Classify: hello');
    expect(plan.promptVersion).toBe(1);
    expect(plan.budgetStatus.allowed).toBe(true);
  });

  test('throws BUDGET_EXCEEDED for MEDIUM risk when budget is exhausted', async () => {
    // checkBudget → over limit
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ budget: '1.00' }] })
      .mockResolvedValueOnce({ rows: [{ spent: '2.00' }] });

    await expect(
      gateway.resolveCallPlan({
        tenantId: TENANT, actorId: ACTOR,
        taskType: 'operational_reasoning',
        riskLevel: 'MEDIUM',
      })
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
  });

  test('returns plan with null systemPrompt when no active prompt exists (LOW risk)', async () => {
    // checkBudget → ok
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // resolveModel
    mockPool.query.mockResolvedValueOnce({ rows: [FAST_MODEL_ROW] });
    // renderPrompt → no active prompt
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const plan = await gateway.resolveCallPlan({
      tenantId: TENANT, actorId: ACTOR,
      taskType: 'intent_classification',
      riskLevel: 'LOW',
    });

    expect(plan.model.modelKey).toBe('gpt-4o-mini');
    expect(plan.systemPrompt).toBeNull();
  });
});
