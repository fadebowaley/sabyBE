#!/usr/bin/env node

const { postgresPool, closePool } = require('../config/postgres');

const MODELS = [
  {
    model_key: 'gpt-4o-mini',
    model_name: 'GPT-4o Mini',
    provider: 'openai',
    latency_class: 'fast',
    priority: 1,
    enabled: true,
    cost_input_per_1k: 0.00015,
    cost_output_per_1k: 0.0006,
    supports_json_mode: true,
    supports_tools: true,
    max_context_tokens: 128000,
  },
  {
    model_key: 'gpt-4o',
    model_name: 'GPT-4o',
    provider: 'openai',
    latency_class: 'medium',
    priority: 1,
    enabled: true,
    cost_input_per_1k: 0.0025,
    cost_output_per_1k: 0.01,
    supports_json_mode: true,
    supports_tools: true,
    max_context_tokens: 128000,
  },
  {
    model_key: 'gpt-4o-strong',
    model_name: 'GPT-4o (Strong)',
    provider: 'openai',
    latency_class: 'strong',
    priority: 1,
    enabled: true,
    cost_input_per_1k: 0.0025,
    cost_output_per_1k: 0.01,
    supports_json_mode: true,
    supports_tools: true,
    max_context_tokens: 128000,
  },
];

(async () => {
  try {
    for (const model of MODELS) {
      await postgresPool.query(
        `INSERT INTO copilot.model_registry (
          model_key, model_name, provider, latency_class, priority, enabled,
          cost_input_per_1k, cost_output_per_1k, supports_json_mode,
          supports_tools, max_context_tokens
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11
        )
        ON CONFLICT (model_key) DO UPDATE SET
          model_name = EXCLUDED.model_name,
          provider = EXCLUDED.provider,
          latency_class = EXCLUDED.latency_class,
          priority = EXCLUDED.priority,
          enabled = EXCLUDED.enabled,
          cost_input_per_1k = EXCLUDED.cost_input_per_1k,
          cost_output_per_1k = EXCLUDED.cost_output_per_1k,
          supports_json_mode = EXCLUDED.supports_json_mode,
          supports_tools = EXCLUDED.supports_tools,
          max_context_tokens = EXCLUDED.max_context_tokens,
          updated_at = NOW()`,
        [
          model.model_key,
          model.model_name,
          model.provider,
          model.latency_class,
          model.priority,
          model.enabled,
          model.cost_input_per_1k,
          model.cost_output_per_1k,
          model.supports_json_mode,
          model.supports_tools,
          model.max_context_tokens,
        ]
      );
    }

    const result = await postgresPool.query(
      'SELECT COUNT(*)::int AS total FROM copilot.model_registry WHERE enabled = true'
    );
    console.log(
      `[seed-copilot-model-registry] total enabled models: ${result.rows[0].total}`
    );
  } catch (error) {
    console.error('[seed-copilot-model-registry] failed:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
})();
