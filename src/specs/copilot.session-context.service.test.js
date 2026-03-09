const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const sessionContextService = require('../services/copilotSessionContext.service');

describe('copilotSessionContext.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns default empty context when none exists', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await sessionContextService.getSessionContext({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        recent_entities: [],
      })
    );
  });

  test('upserts session context', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ id: 'ctx-1', tenant_id: 'tenant-1', user_id: 'user-1' }],
    });

    const result = await sessionContextService.upsertSessionContext({
      tenantId: 'tenant-1',
      userId: 'user-1',
      currentProjectId: 'project-1',
      context: { step: 'review' },
    });

    expect(result).toEqual(
      expect.objectContaining({ id: 'ctx-1', tenant_id: 'tenant-1' })
    );
    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.session_context'),
      expect.any(Array)
    );
  });

  test('clearFocusState requires focusType', async () => {
    await expect(
      sessionContextService.clearFocusState({
        tenantId: 'tenant-1',
        userId: 'user-1',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('focusType is required'),
    });
  });
});
