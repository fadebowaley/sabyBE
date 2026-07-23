const generatedAnalysisPolicy = require('../services/executiveGeneratedAnalysisPolicy.service');

describe('executiveGeneratedAnalysisPolicy.service', () => {
  test('validates a bounded read-only SELECT over an approved source', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql(
      'SELECT branch, SUM(amount) FROM safe_project_form_facts GROUP BY branch LIMIT 25',
      { maxRows: 100 }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        astValidated: true,
        readOnly: true,
        limit: 25,
      })
    );
    expect(result.sources).toContain('safe_project_form_facts');
    expect(result.boundedSql).not.toMatch(/saby_generated_query/i);
  });

  test('wraps an unbounded read-only SELECT with a maximum row limit', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql('SELECT * FROM safe_project_form_facts', {
      maxRows: 50,
    });

    expect(result.ok).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.boundedSql).toBe(
      'SELECT * FROM (SELECT * FROM safe_project_form_facts) AS saby_generated_query LIMIT 50'
    );
  });

  test('allows read-only CTEs over approved sources', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql(`
      WITH branch_totals AS (
        SELECT branch, COUNT(*) AS total FROM safe_project_form_facts GROUP BY branch
      )
      SELECT * FROM branch_totals LIMIT 10
    `);

    expect(result.ok).toBe(true);
    expect(result.sources).toEqual(['safe_project_form_facts']);
  });

  test('rejects write statements', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql("UPDATE users SET role = 'owner'");

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'SQL_NOT_READ_ONLY_SELECT',
      })
    );
  });

  test('rejects multiple statements', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql(
      'SELECT * FROM safe_project_form_facts LIMIT 1; SELECT * FROM users LIMIT 1'
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'SQL_MULTIPLE_STATEMENTS',
      })
    );
  });

  test('rejects blocked sources', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql('SELECT * FROM users LIMIT 10');

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'SQL_SOURCE_NOT_ALLOWED',
      })
    );
  });

  test('rejects blocked functions', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql('SELECT pg_sleep(1) FROM safe_project_form_facts LIMIT 1');

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'SQL_FUNCTION_NOT_ALLOWED',
      })
    );
  });

  test('validates safe Python analysis code but requires a sandbox', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(`
import pandas as pd
summary = dataset.groupby("branch")["amount"].sum()
`);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        language: 'python',
        sandboxRequired: true,
        networkAllowed: false,
      })
    );
  });

  test('does not treat import words inside Python strings as imports', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(
      `
rows = dataset["rows"]
result = {
  "summary": "Run from Intelligence after import-safe validation.",
  "findings": ["No import statement was executed."],
  "metrics": {"row_count": len(rows)}
}
`,
      { disallowImports: true }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        language: 'python',
      })
    );
  });

  test('rejects unsafe Python code operations', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(`
import os
os.system("cat /etc/passwd")
`);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'CODE_IMPORT_OS',
      })
    );
  });

  test('rejects unsupported generated code runtimes', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode('console.log("run")', { language: 'javascript' });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'CODE_LANGUAGE_NOT_ALLOWED',
      })
    );
  });

  test('reports validation-only generated analysis policy by default', () => {
    const originalMode = process.env.EXECUTIVE_INTELLIGENCE_GENERATED_ANALYSIS;
    delete process.env.EXECUTIVE_INTELLIGENCE_GENERATED_ANALYSIS;

    const snapshot = generatedAnalysisPolicy.getPolicySnapshot();

    expect(snapshot).toEqual(
      expect.objectContaining({
        mode: 'disabled',
        generated_sql_allowed: false,
        generated_code_execution_allowed: false,
        sandbox_execution_allowed: false,
        ast_validation_required: true,
      })
    );

    if (originalMode === undefined) {
      delete process.env.EXECUTIVE_INTELLIGENCE_GENERATED_ANALYSIS;
    } else {
      process.env.EXECUTIVE_INTELLIGENCE_GENERATED_ANALYSIS = originalMode;
    }
  });
});
