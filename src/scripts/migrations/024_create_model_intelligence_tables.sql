-- Migration 024: Model Registry + Prompt Versions
-- Phase 4 Intelligence Gateway infrastructure

-- ── Model Registry ────────────────────────────────────────────────────────────
-- Catalog of available LLM models with capability, cost, and latency metadata.
-- The model router reads from this table at runtime to select the best model
-- for each task_type / risk_level combination.

CREATE TABLE IF NOT EXISTS copilot.model_registry (
  id                   UUID                     NOT NULL DEFAULT uuid_generate_v4(),
  model_key            VARCHAR(64)              NOT NULL,
  provider             VARCHAR(32)              NOT NULL DEFAULT 'openai',
  model_name           VARCHAR(120)             NOT NULL,
  latency_class        VARCHAR(16)              NOT NULL DEFAULT 'medium',
  task_types           JSONB                    NOT NULL DEFAULT '[]',
  max_context_tokens   INTEGER,
  cost_input_per_1k    NUMERIC(10,6)            NOT NULL DEFAULT 0,
  cost_output_per_1k   NUMERIC(10,6)            NOT NULL DEFAULT 0,
  supports_json_mode   BOOLEAN                  NOT NULL DEFAULT true,
  supports_tools       BOOLEAN                  NOT NULL DEFAULT true,
  priority             INTEGER                  NOT NULL DEFAULT 100,
  enabled              BOOLEAN                  NOT NULL DEFAULT true,
  metadata             JSONB                    NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT model_registry_pkey          PRIMARY KEY (id),
  CONSTRAINT model_registry_model_key_key UNIQUE (model_key),
  CONSTRAINT model_registry_latency_class_chk
    CHECK (latency_class IN ('fast', 'medium', 'strong')),
  CONSTRAINT model_registry_provider_chk
    CHECK (provider IN ('openai', 'anthropic', 'google', 'azure'))
);

CREATE INDEX IF NOT EXISTS idx_model_registry_latency_class
  ON copilot.model_registry (latency_class, priority)
  WHERE enabled = true;

-- Auto-update updated_at
CREATE TRIGGER trg_model_registry_updated_at
  BEFORE UPDATE ON copilot.model_registry
  FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

-- ── Seed: initial model catalog ───────────────────────────────────────────────
INSERT INTO copilot.model_registry
  (model_key, provider, model_name, latency_class, task_types,
   max_context_tokens, cost_input_per_1k, cost_output_per_1k,
   supports_json_mode, supports_tools, priority)
VALUES
  (
    'gpt-4o-mini', 'openai', 'gpt-4o-mini', 'fast',
    '["intent_classification","tool_selection","data_extraction","entity_resolution"]',
    128000, 0.000150, 0.000600, true, true, 10
  ),
  (
    'gpt-4.1-mini', 'openai', 'gpt-4.1-mini', 'fast',
    '["intent_classification","tool_selection","data_extraction","entity_resolution","workflow_planning"]',
    1000000, 0.000400, 0.001600, true, true, 20
  ),
  (
    'gpt-4o', 'openai', 'gpt-4o', 'strong',
    '["executive_report","operational_reasoning","code_debugging","sensitive_action","complex_analysis"]',
    128000, 0.002500, 0.010000, true, true, 10
  ),
  (
    'gpt-4.1', 'openai', 'gpt-4.1', 'strong',
    '["executive_report","operational_reasoning","code_debugging","sensitive_action","complex_analysis","workflow_planning"]',
    1000000, 0.002000, 0.008000, true, true, 20
  ),
  (
    'gpt-4.1-nano', 'openai', 'gpt-4.1-nano', 'fast',
    '["intent_classification","entity_resolution"]',
    1000000, 0.000100, 0.000400, true, false, 5
  )
ON CONFLICT (model_key) DO NOTHING;

-- ── Prompt Versions ───────────────────────────────────────────────────────────
-- Versioned prompt templates. Each prompt_key has one or more versions; only
-- one may be 'active' at a time. The prompt registry service enforces this.

CREATE TABLE IF NOT EXISTS copilot.prompt_versions (
  id                   UUID                     NOT NULL DEFAULT uuid_generate_v4(),
  prompt_key           VARCHAR(120)             NOT NULL,
  version              INTEGER                  NOT NULL,
  owner                VARCHAR(64)              NOT NULL DEFAULT 'system',
  description          TEXT,
  system_prompt        TEXT                     NOT NULL,
  user_prompt_template TEXT,
  input_variables      JSONB                    NOT NULL DEFAULT '[]',
  output_schema        JSONB                    NOT NULL DEFAULT '{}',
  model_hint           VARCHAR(64),
  task_type            VARCHAR(64),
  status               VARCHAR(16)              NOT NULL DEFAULT 'draft',
  eval_set             JSONB                    NOT NULL DEFAULT '[]',
  changelog            TEXT,
  created_by           VARCHAR(255),
  created_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT prompt_versions_pkey        PRIMARY KEY (id),
  CONSTRAINT prompt_versions_unique_ver  UNIQUE (prompt_key, version),
  CONSTRAINT prompt_versions_status_chk
    CHECK (status IN ('draft', 'active', 'deprecated')),
  CONSTRAINT prompt_versions_version_pos CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_key_status
  ON copilot.prompt_versions (prompt_key, status);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_task_type
  ON copilot.prompt_versions (task_type, status);

-- Only one active version per prompt_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_single_active
  ON copilot.prompt_versions (prompt_key)
  WHERE status = 'active';

CREATE TRIGGER trg_prompt_versions_updated_at
  BEFORE UPDATE ON copilot.prompt_versions
  FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

-- ── Seed: core prompt templates ───────────────────────────────────────────────
INSERT INTO copilot.prompt_versions
  (prompt_key, version, owner, description, system_prompt, user_prompt_template,
   input_variables, output_schema, model_hint, task_type, status, changelog, created_by)
VALUES
  (
    'intent_classifier', 1, 'system',
    'Classifies a user utterance into one of the supported Saby intents',
    E'You are the Saby intent classifier. Your job is to read the user message and output a single JSON object.\n\nSupported intents:\n- submit_data: User wants to submit or record data\n- query_data: User wants to look up, find, or retrieve information\n- check_compliance: User wants to know about compliance status or missing submissions\n- generate_report: User wants a summary, report, or briefing\n- manage_permissions: User wants to grant, revoke, or inspect permissions\n- trigger_workflow: User wants to start or manage a business workflow\n- general_help: Anything else or unclear\n\nRespond ONLY with valid JSON in this exact format:\n{"intent":"<one of the above>","confidence":"high"|"medium"|"low","reasoning":"<one sentence>"}',
    'User message: {{message}}',
    '["message"]',
    '{"type":"object","required":["intent","confidence","reasoning"],"properties":{"intent":{"type":"string"},"confidence":{"type":"string","enum":["high","medium","low"]},"reasoning":{"type":"string"}}}',
    'gpt-4o-mini', 'intent_classification', 'active',
    'Initial release', 'system'
  ),
  (
    'tool_selector', 1, 'system',
    'Selects the most relevant copilot tools given user intent and available tool list',
    E'You are the Saby tool selector. Given the user intent and a list of available tools, select the tools that are most relevant to fulfilling the request.\n\nRules:\n- Only select tools from the provided list\n- Never select more than 5 tools\n- Prefer specific tools over general ones\n- If no tools are relevant, return an empty array\n- Do not invent tool names\n\nRespond ONLY with valid JSON:\n{"selectedTools":["tool_name_1","tool_name_2"],"reasoning":"<one sentence>"}',
    'User intent: {{intent}}\nUser message: {{message}}\nAvailable tools: {{tools}}',
    '["intent","message","tools"]',
    '{"type":"object","required":["selectedTools","reasoning"],"properties":{"selectedTools":{"type":"array","items":{"type":"string"}},"reasoning":{"type":"string"}}}',
    'gpt-4o-mini', 'tool_selection', 'active',
    'Initial release', 'system'
  ),
  (
    'executive_brief', 1, 'system',
    'Generates a structured executive summary from structured data context',
    E'You are a senior business intelligence analyst for Saby. Generate a concise executive briefing from the data provided.\n\nGuidelines:\n- Lead with the most important insight\n- Use numbers and percentages where available\n- Flag risks clearly\n- Keep language professional and direct\n- Do not fabricate data not present in the context\n\nRespond in this JSON format:\n{"headline":"<one sentence>","keyInsights":["..."],"risks":["..."],"recommendedActions":["..."]}',
    'Briefing context:\n{{context}}\n\nTime period: {{period}}',
    '["context","period"]',
    '{"type":"object","required":["headline","keyInsights","risks","recommendedActions"]}',
    'gpt-4o', 'executive_report', 'active',
    'Initial release', 'system'
  )
ON CONFLICT (prompt_key, version) DO NOTHING;
