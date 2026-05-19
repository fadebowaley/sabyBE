DROP TRIGGER IF EXISTS trg_agent_escalations_updated_at ON copilot.agent_escalations;
DROP TRIGGER IF EXISTS trg_agent_schedules_updated_at ON copilot.agent_schedules;
DROP TRIGGER IF EXISTS trg_agent_errors_updated_at ON copilot.agent_errors;
DROP TRIGGER IF EXISTS trg_agent_task_steps_updated_at ON copilot.agent_task_steps;
DROP TRIGGER IF EXISTS trg_agent_tasks_updated_at ON copilot.agent_tasks;

DROP TABLE IF EXISTS copilot.agent_escalations;
DROP TABLE IF EXISTS copilot.agent_schedules;
DROP TABLE IF EXISTS copilot.agent_errors;
DROP TABLE IF EXISTS copilot.agent_tool_calls;
DROP TABLE IF EXISTS copilot.agent_task_steps;
DROP TABLE IF EXISTS copilot.agent_tasks;
