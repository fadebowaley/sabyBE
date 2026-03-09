const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const copilotAuditExportService = require('../services/copilotAuditExport.service');

describe('copilotAuditExport.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queues audit export job', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ id: 'job-1', status: 'queued', export_type: 'action_events' }],
    });

    const result = await copilotAuditExportService.createAuditExportJob({
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      exportType: 'action_events',
      filters: { actionType: 'create_user' },
    });

    expect(result).toMatchObject({ id: 'job-1', status: 'queued' });
    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.audit_export_jobs'),
      expect.any(Array)
    );
  });

  test('rejects list call when tenantId missing', async () => {
    await expect(
      copilotAuditExportService.listAuditExportJobs({ tenantId: null })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('tenantId is required'),
    });
  });

  test('throws not found for unknown job id', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      copilotAuditExportService.getAuditExportJobById({
        tenantId: 'tenant-1',
        jobId: '00000000-0000-4000-8000-000000000000',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.NOT_FOUND,
      message: expect.stringContaining('Audit export job not found'),
    });
  });
});
