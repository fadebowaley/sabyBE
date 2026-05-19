-- Rollback 024: Model Registry + Prompt Versions

DROP TABLE IF EXISTS copilot.prompt_versions CASCADE;
DROP TABLE IF EXISTS copilot.model_registry CASCADE;
