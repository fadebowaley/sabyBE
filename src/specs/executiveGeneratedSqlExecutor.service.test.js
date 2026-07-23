jest.mock('../config/postgres', () => ({
  postgresPool: {
    connect: jest.fn(),
  },
}));

const { postgresPool } = require('../config/postgres');
const generatedSqlExecutor = require('../services/executiveGeneratedSqlExecutor.service');

const ORIGINAL_ENV = process.env;

const makeClient = (queryImpl) => ({
  query: jest.fn(queryImpl),
  release: jest.fn(),
});

describe('executiveGeneratedSqlExecutor.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED;
    delete process.env.EXECUTIVE_INTELLIGENCE_SQL_MAX_ROWS;
    delete process.env.EXECUTIVE_INTELLIGENCE_SQL_STATEMENT_TIMEOUT_MS;
    delete process.env.EXECUTIVE_INTELLIGENCE_SQL_LOCK_TIMEOUT_MS;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('fails closed by default without opening a database connection', async () => {
    const result = await generatedSqlExecutor.executeGeneratedSql({
      sql: 'SELECT branch FROM safe_project_form_facts LIMIT 5',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        reason: 'SQL_EXECUTION_DISABLED',
        rawClientSqlAllowed: false,
        rawSqlReturned: false,
        readOnly: true,
      })
    );
    expect(result.validation.ok).toBe(true);
    expect(postgresPool.connect).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('SELECT branch');
  });

  test('blocks invalid SQL before opening a database connection', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED = 'true';

    const result = await generatedSqlExecutor.executeGeneratedSql({
      sql: "DELETE FROM safe_project_form_facts WHERE tenant_id = 'tenant-1'",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        reason: 'SQL_NOT_READ_ONLY_SELECT',
      })
    );
    expect(postgresPool.connect).not.toHaveBeenCalled();
  });

  test('executes validated generated SQL inside a read-only bounded transaction when explicitly enabled', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED = 'true';
    process.env.EXECUTIVE_INTELLIGENCE_SQL_STATEMENT_TIMEOUT_MS = '2500';
    process.env.EXECUTIVE_INTELLIGENCE_SQL_LOCK_TIMEOUT_MS = '750';

    const client = makeClient((sql) => {
      if (/^SELECT/i.test(sql)) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ branch: 'Lagos', total: '12' }],
          fields: [
            { name: 'branch', dataTypeID: 25 },
            { name: 'total', dataTypeID: 20 },
          ],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    });
    postgresPool.connect.mockResolvedValue(client);

    const result = await generatedSqlExecutor.executeGeneratedSql({
      sql: 'SELECT branch, COUNT(*) AS total FROM safe_project_form_facts GROUP BY branch LIMIT 10',
      requestId: 'req-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        requestId: 'req-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        rowCount: 1,
        rawSqlReturned: false,
        rawClientSqlAllowed: false,
        readOnly: true,
      })
    );
    expect(result.queryFingerprint).toMatch(/^sha256:/);
    expect(result.fields).toEqual([
      { name: 'branch', dataTypeID: 25 },
      { name: 'total', dataTypeID: 20 },
    ]);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN READ ONLY');
    expect(client.query).toHaveBeenNthCalledWith(2, "SET LOCAL statement_timeout = '2500ms'");
    expect(client.query).toHaveBeenNthCalledWith(3, "SET LOCAL lock_timeout = '750ms'");
    expect(client.query).toHaveBeenCalledWith(
      'SELECT branch, COUNT(*) AS total FROM safe_project_form_facts GROUP BY branch LIMIT 10',
      []
    );
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('SELECT branch');
  });

  test('rolls back and returns a safe failure if database execution fails', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED = 'true';

    const client = makeClient((sql) => {
      if (/^SELECT/i.test(sql)) {
        const error = new Error('statement timeout');
        error.code = '57014';
        return Promise.reject(error);
      }
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    });
    postgresPool.connect.mockResolvedValue(client);

    const result = await generatedSqlExecutor.executeGeneratedSql({
      sql: 'SELECT branch FROM safe_project_form_facts LIMIT 5',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        reason: '57014',
        message: 'statement timeout',
        rawSqlReturned: false,
      })
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
