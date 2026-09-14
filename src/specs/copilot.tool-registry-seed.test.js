const { TOOLS } = require('../scripts/seed-copilot-tool-registry');

const PHASE1_TOOLS = TOOLS.filter((tool) => !tool.tool_name.startsWith('action_'));

describe('copilot tool registry seed contracts', () => {
  test('every Phase 1 seeded tool has safety metadata', () => {
    expect(PHASE1_TOOLS.length).toBeGreaterThan(0);

    PHASE1_TOOLS.forEach((tool) => {
      expect(tool.tool_name).toEqual(expect.any(String));
      expect(tool.action_type).toEqual(expect.any(String));
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(tool.risk_level);
      expect(Array.isArray(tool.required_permissions)).toBe(true);
      expect(tool.required_permissions.length).toBeGreaterThan(0);
      expect(tool.tenant_scope_required).toBe(true);
      expect(tool.audit_required).toBe(true);
      expect(tool.retry_policy).toEqual(
        expect.objectContaining({
          maxAttempts: expect.any(Number),
          backoffMs: expect.any(Number),
        })
      );
      expect(tool.rollback_strategy).toEqual(expect.any(String));
      expect(tool.schema_json).toEqual(
        expect.objectContaining({
          type: 'object',
          required: expect.arrayContaining(['actionPayload']),
        })
      );
      expect(tool.output_schema_json).toEqual(
        expect.objectContaining({
          type: 'object',
        })
      );
    });
  });

  test('high and critical Phase 1 tools require approval and idempotency', () => {
    const highRiskTools = PHASE1_TOOLS.filter((tool) =>
      ['HIGH', 'CRITICAL'].includes(tool.risk_level)
    );

    expect(highRiskTools.length).toBeGreaterThan(0);
    highRiskTools.forEach((tool) => {
      expect(tool.requires_approval).toBe(true);
      expect(tool.idempotency_key_required).toBe(true);
      expect(tool.schema_json.properties).toEqual(
        expect.objectContaining({
          idempotencyKey: expect.objectContaining({ type: 'string' }),
        })
      );
    });
  });
});
