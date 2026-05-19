-- Rollback Migration 027: Enterprise Autonomy

DROP TABLE IF EXISTS copilot.incident_records       CASCADE;
DROP TABLE IF EXISTS copilot.incident_playbooks     CASCADE;
DROP TABLE IF EXISTS copilot.agent_eval_results     CASCADE;
DROP TABLE IF EXISTS copilot.agent_eval_datasets    CASCADE;
DROP TABLE IF EXISTS copilot.agent_feedback         CASCADE;
DROP TABLE IF EXISTS copilot.workflow_runs          CASCADE;
DROP TABLE IF EXISTS copilot.workflow_definitions   CASCADE;
