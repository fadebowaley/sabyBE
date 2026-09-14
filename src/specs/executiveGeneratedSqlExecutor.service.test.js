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
      sql: 'SELECT branch FROM form_submission_facts LIMIT 5',
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
      sql: "DELETE FROM form_submission_facts WHERE tenant_id = 'tenant-1'",
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
      sql: 'SELECT branch, COUNT(*) AS total FROM form_submission_facts GROUP BY branch LIMIT 10',
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
      'SELECT branch , (count (*) ) AS total  FROM form_submission_facts   WHERE (tenant_id = ($1)) GROUP BY branch LIMIT (10)',
      ['tenant-1']
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
      sql: 'SELECT branch FROM form_submission_facts LIMIT 5',
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

describe('injectTenantFilter AST rewriting', () => {
  const allowed = new Set(['form_submissions', 'form_submission_facts', 'node_dimension', 'event_calendar']);
  const TENANT = 'tenant-42';

  const inject = (sql, allowedSources = allowed) =>
    generatedSqlExecutor.injectTenantFilter(sql, TENANT, allowedSources);

  test('injects tenant_id = $1 into a simple SELECT and sets the parameter', () => {
    const out = inject('SELECT * FROM form_submissions LIMIT 5');
    expect(out).not.toBeNull();
    expect(out.params).toEqual([TENANT]);
    expect(out.boundedSql).toContain('tenant_id = ($1)');
    expect(out.boundedSql).toMatch(/FROM form_submissions/);
  });

  test('shifts an existing $1 parameter to $2 so tenant_id owns $1', () => {
    const out = inject('SELECT * FROM form_submissions WHERE project_id = $1');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('(project_id = ($2))');
    expect(out.boundedSql).toContain('tenant_id = ($1)');
    expect(out.boundedSql).not.toContain('project_id = ($1)');
  });

  test('shifts multiple existing parameters preserving order', () => {
    const out = inject('SELECT * FROM form_submissions WHERE a = $1 AND b = $2 LIMIT $3');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('a = ($2)');
    expect(out.boundedSql).toContain('b = ($3)');
    expect(out.boundedSql).toContain('LIMIT ($4)');
  });

  test('qualifies tenant_id filters with table aliases in multi-table joins', () => {
    const out = inject(
      'SELECT a, b FROM form_submissions fs JOIN node_dimension nd ON fs.node_id = nd.node_id WHERE fs.project_id = $1'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('fs .tenant_id = ($1)');
    expect(out.boundedSql).toContain('nd .tenant_id = ($1)');
    expect(out.boundedSql).toContain('fs .project_id = ($2)');
  });

  test('uses unqualified tenant_id when no alias is present', () => {
    const out = inject('SELECT * FROM form_submissions WHERE amount > $1');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('tenant_id = ($1)');
    expect(out.boundedSql).toContain('amount > ($2)');
  });

  test('injects into the CTE binding, not the reference, for WITH queries', () => {
    const out = inject('WITH t AS (SELECT * FROM form_submissions WHERE status = $1) SELECT * FROM t');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('status = ($2)');
    expect(out.boundedSql).toMatch(/form_submissions\s+WHERE \(\(status = \(\$2\)\) AND \(tenant_id = \(\$1\)\)\)/);
  });

  test('handles nested CTEs with per-binding scoping', () => {
    const out = inject(
      'WITH a AS (SELECT * FROM form_submissions WHERE x = $1), b AS (SELECT * FROM a WHERE y = $2) SELECT * FROM b'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('x = ($2)');
    expect(out.boundedSql).toContain('y = ($3)');
  });

  test('injects into derived-table subqueries', () => {
    const out = inject('SELECT * FROM (SELECT * FROM form_submissions WHERE amount > $1) sub');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('amount > ($2)');
    expect(out.boundedSql).toContain('tenant_id = ($1)');
  });

  test('injects a filter into every branch of a UNION ALL', () => {
    const out = inject('SELECT a FROM form_submissions UNION ALL SELECT b FROM form_submissions');
    expect(out).not.toBeNull();
    const count = out.boundedSql.split('tenant_id = ($1)').length - 1;
    expect(count).toBe(2);
  });

  test('injects into both sides of a UNION', () => {
    const out = inject(
      'SELECT a FROM node_dimension UNION SELECT b FROM form_submissions WHERE b = $1'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql.split('tenant_id = ($1)').length - 1).toBe(2);
    expect(out.boundedSql).toContain('b = ($2)');
  });

  test('rejects INTERSECT/EXCEPT as unsupported by the AST parser and validator', () => {
    const out = inject(
      'SELECT a FROM form_submissions WHERE a = $1 INTERSECT SELECT a FROM node_dimension'
    );
    expect(out).toBeNull();
  });

  test('scopes EXISTS correlated subqueries and their outer query', () => {
    const out = inject(
      'SELECT a FROM form_submissions f WHERE EXISTS (SELECT 1 FROM node_dimension nd WHERE nd.node_id = f.node_id AND nd.name = $1)'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('f .tenant_id = ($1)');
    expect(out.boundedSql).toContain('nd .tenant_id = ($1)');
    expect(out.boundedSql).toContain('nd .name = ($2)');
  });

  test('scopes LATERAL joined subqueries', () => {
    const out = inject(
      'SELECT * FROM node_dimension nd, LATERAL (SELECT * FROM form_submissions fs WHERE fs.node_id = nd.node_id) sub'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('nd .tenant_id = ($1)');
    expect(out.boundedSql).toContain('fs .tenant_id = ($1)');
  });

  test('handles self-joins with distinct aliases', () => {
    const out = inject(
      'SELECT a.id, b.id FROM form_submissions a JOIN form_submissions b ON a.parent_id = b.id'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('a .tenant_id = ($1)');
    expect(out.boundedSql).toContain('b .tenant_id = ($1)');
  });

  test('does not inject into non-allowed tables', () => {
    const out = inject('SELECT * FROM secret_table WHERE x = $1');
    expect(out).toBeNull();
  });

  test('returns null when no allowed tables are referenced', () => {
    const out = inject('SELECT 1');
    expect(out).toBeNull();
  });

  test('returns null on parse failure', () => {
    const out = inject('SELECT FROM WHERE ;;;');
    expect(out).toBeNull();
  });

  test('returns null for multi-statement input', () => {
    const out = inject('SELECT * FROM form_submissions LIMIT 1; SELECT * FROM node_dimension LIMIT 1');
    expect(out).toBeNull();
  });

  test('handles schema-qualified and quoted identifiers', () => {
    const out = inject('SELECT * FROM "public"."form_submissions"');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('tenant_id = ($1)');
  });

  test('shifts parameters in window functions and GROUP BY/HAVING', () => {
    const out = inject(
      'SELECT branch, RANK() OVER (ORDER BY total DESC) FROM form_submissions WHERE total > $1 GROUP BY branch HAVING COUNT(*) > $2'
    );
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('total > ($2)');
    expect(out.boundedSql).toContain('$3');
  });

  test('executor passes tenantId as $1 followed by shifted original parameters', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED = 'true';

    const client = makeClient((sql) => {
      if (/^SELECT/i.test(sql)) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ branch: 'Lagos' }],
          fields: [{ name: 'branch', dataTypeID: 25 }],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    });
    postgresPool.connect.mockResolvedValue(client);

    await generatedSqlExecutor.executeGeneratedSql({
      sql: 'SELECT branch FROM form_submissions WHERE branch = $1',
      parameters: ['Yaba'],
      tenantId: 'tenant-9',
    });

    const selectCall = client.query.mock.calls.find(([sql]) => /^SELECT/i.test(sql));
    expect(selectCall[0]).toContain('branch = ($2)');
    expect(selectCall[1]).toEqual(['tenant-9', 'Yaba']);
  });

  test('executor relaxes SQL further down the layers when injection covers all allowed tables', () => {
    const out = inject('SELECT * FROM event_calendar WHERE start >= $1');
    expect(out).not.toBeNull();
    expect(out.boundedSql).toContain('start >= ($2)');
    expect(out.boundedSql).toContain('tenant_id = ($1)');
  });
});
