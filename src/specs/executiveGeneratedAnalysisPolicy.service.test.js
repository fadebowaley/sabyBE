const generatedAnalysisPolicy = require('../services/executiveGeneratedAnalysisPolicy.service');

describe('executiveGeneratedAnalysisPolicy.service', () => {
  test('validates a bounded read-only SELECT over an approved source', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql(
      'SELECT branch, SUM(amount) FROM form_submission_facts GROUP BY branch LIMIT 25',
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
    expect(result.sources).toContain('form_submission_facts');
    expect(result.boundedSql).not.toMatch(/saby_generated_query/i);
  });

  test('wraps an unbounded read-only SELECT with a maximum row limit', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql('SELECT * FROM form_submission_facts', {
      maxRows: 50,
    });

    expect(result.ok).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.boundedSql).toBe(
      'SELECT * FROM (SELECT * FROM form_submission_facts) AS saby_generated_query LIMIT 50'
    );
  });

  test('allows read-only CTEs over approved sources', () => {
    const result = generatedAnalysisPolicy.validateGeneratedSql(`
      WITH branch_totals AS (
        SELECT branch, COUNT(*) AS total FROM form_submission_facts GROUP BY branch
      )
      SELECT * FROM branch_totals LIMIT 10
    `);

    expect(result.ok).toBe(true);
    expect(result.sources).toEqual(['form_submission_facts']);
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
      'SELECT * FROM form_submission_facts LIMIT 1; SELECT * FROM users LIMIT 1'
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
    const result = generatedAnalysisPolicy.validateGeneratedSql('SELECT pg_sleep(1) FROM form_submission_facts LIMIT 1');

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

describe('executiveGeneratedAnalysisPolicy Python escape-gadget blocklist', () => {
  const expectBlocked = (code, expectedCode) => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(code);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: expectedCode,
      })
    );
  };

  test.each([
    ['__class__', 'CODE_DUNDER_CLASS', 'payload = "".__class__'],
    ['__bases__', 'CODE_DUNDER_BASES', 'base = int.__bases__'],
    ['__subclasses__', 'CODE_DUNDER_SUBCLASSES', 'sc = int.__subclasses__()'],
    ['__globals__', 'CODE_DUNDER_GLOBALS', 'g = (lambda: 0).__globals__'],
    ['__mro__', 'CODE_DUNDER_MRO', 'm = int.__mro__'],
    ['__getattr__', 'CODE_DUNDER_GETATTR', 'x = helper.__getattr__'],
    ['getattr(', 'CODE_GETATTR_CALL', 'v = getattr([] , "name")'],
    ['__init__.__globals__', 'CODE_DUNDER_INIT_GLOBALS', 'vg = (lambda: 0).__init__.__globals__'],
    ['object.', 'CODE_OBJECT_DOT', 'o = object.__init__'],
    ['type(', 'CODE_TYPE_CALL', 't = type("Locked", (), {})'],
    ['__build_class__', 'CODE_BUILD_CLASS', 'fb = __build_class__'],
    ['builtins', 'CODE_BUILTINS_ACCESS', 'b = builtins'],
    ['__import__(', 'CODE_DYNAMIC_IMPORT', 'm = __import__("os")'],
  ])('blocks escape gadget %s (%s)', (gadget, code, snippet) => {
    expectBlocked(`\n${snippet}\nresult = dataset\n`, code);
  });

  test('blocks a full escape chain built from safe builtins', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(`
def v():
    return len("")
chained = v.__globals__["__builtins__"]["__import__"]("os")
result = {"chained": True}
`);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'CODE_DUNDER_GLOBALS',
      })
    );
  });

  test('allows legitimate data-analysis code that does not touch escape gadgets', () => {
    const result = generatedAnalysisPolicy.validateGeneratedCode(`
rows = dataset.get("rows", [])
summary = {}
for row in rows:
    branch = row.get("branch", "unknown")
    summary[branch] = summary.get(branch, 0) + row.get("amount", 0)
result = {"summary": summary, "row_count": len(rows)}
`);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        language: 'python',
        sandboxRequired: true,
      })
    );
  });
});
