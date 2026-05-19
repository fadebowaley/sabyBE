const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const copilotApprovalService = require('../services/copilotApproval.service');

describe('copilotApproval.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates approval decision for approval-required tool', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'reset_password_tool',
            action_type: 'reset_password',
            requires_approval: true,
            risk_level: 'CRITICAL',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ action_type: 'reset_password', requires_approval: true }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-1',
            approval_token: 'token-1',
            status: 'approved',
            trace_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      });

    const result = await copilotApprovalService.createApprovalDecision({
      tenantId: 'tenant-1',
      requestedByUserId: 'user-1',
      approvedByUserId: 'user-1',
      toolName: 'reset_password_tool',
      payload: {
        idempotencyKey: 'idem-1',
        actionPayload: {
          email: 'person@example.com',
          newPassword: 'Secret123!',
        },
      },
      approvalToken: 'token-1',
      traceId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'approval-1',
        approval_token: 'token-1',
        status: 'approved',
      })
    );
  });

  test('rejects approval token reuse with different payload hash', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'reset_password_tool',
            action_type: 'reset_password',
            requires_approval: true,
            risk_level: 'CRITICAL',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ action_type: 'reset_password', requires_approval: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-1',
            tenant_id: 'tenant-1',
            requested_by_user_id: 'user-1',
            tool_name: 'reset_password_tool',
            action_type: 'reset_password',
            entity_id: null,
            input_hash: 'different-hash',
          },
        ],
      });

    await expect(
      copilotApprovalService.createApprovalDecision({
        tenantId: 'tenant-1',
        requestedByUserId: 'user-1',
        approvedByUserId: 'user-1',
        toolName: 'reset_password_tool',
        payload: {
          idempotencyKey: 'idem-1',
          actionPayload: {
            email: 'person@example.com',
            newPassword: 'Secret123!',
          },
        },
        approvalToken: 'token-1',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('Approval token reuse'),
    });
  });

  test('validates approved token and detects payload mismatch', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'approval-1',
          tenant_id: 'tenant-1',
          requested_by_user_id: 'user-1',
          tool_name: 'reset_password_tool',
          action_type: 'reset_password',
          entity_id: null,
          input_hash: 'different-hash',
          status: 'approved',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });

    const result = await copilotApprovalService.validateApprovalDecision({
      tenantId: 'tenant-1',
      userId: 'user-1',
      toolName: 'reset_password_tool',
      actionType: 'reset_password',
      payload: {
        idempotencyKey: 'idem-1',
        actionPayload: {
          email: 'person@example.com',
          newPassword: 'Secret123!',
        },
      },
      approvalToken: 'token-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'approval_input_mismatch',
        approvalId: 'approval-1',
      })
    );
  });
});
