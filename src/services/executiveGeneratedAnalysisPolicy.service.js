const { parse } = require('pgsql-ast-parser');

const MAX_SQL_CHARS = 20000;
const MAX_CODE_CHARS = 20000;
const DEFAULT_MAX_ROWS = 5000;

const DEFAULT_ALLOWED_SQL_SOURCES = [
  'executive_intelligence_safe_facts',
  'project_form_report_rows',
  'safe_project_form_facts',
];

const ALLOWED_SQL_FUNCTIONS = new Set([
  'abs',
  'avg',
  'ceil',
  'ceiling',
  'coalesce',
  'count',
  'date_part',
  'date_trunc',
  'extract',
  'floor',
  'greatest',
  'least',
  'lower',
  'max',
  'min',
  'nullif',
  'round',
  'sum',
  'to_char',
  'trim',
  'upper',
]);

const BLOCKED_CODE_PATTERNS = [
  { code: 'CODE_IMPORT_OS', pattern: /\b(import|from)\s+os\b/ },
  { code: 'CODE_IMPORT_SYS', pattern: /\b(import|from)\s+sys\b/ },
  { code: 'CODE_IMPORT_SUBPROCESS', pattern: /\b(import|from)\s+subprocess\b/ },
  { code: 'CODE_IMPORT_SOCKET', pattern: /\b(import|from)\s+socket\b/ },
  { code: 'CODE_IMPORT_REQUESTS', pattern: /\b(import|from)\s+requests\b/ },
  { code: 'CODE_IMPORT_URLLIB', pattern: /\b(import|from)\s+urllib\b/ },
  { code: 'CODE_IMPORT_PATHLIB', pattern: /\b(import|from)\s+pathlib\b/ },
  { code: 'CODE_IMPORT_SHUTIL', pattern: /\b(import|from)\s+shutil\b/ },
  { code: 'CODE_IMPORT_GLOB', pattern: /\b(import|from)\s+glob\b/ },
  { code: 'CODE_DYNAMIC_IMPORT', pattern: /\b__import__\s*\(/ },
  { code: 'CODE_EVAL', pattern: /\beval\s*\(/ },
  { code: 'CODE_EXEC', pattern: /\bexec\s*\(/ },
  { code: 'CODE_COMPILE', pattern: /\bcompile\s*\(/ },
  { code: 'CODE_OPEN_FILE', pattern: /\bopen\s*\(/ },
  { code: 'CODE_ENV_ACCESS', pattern: /\benviron\b|\bgetenv\s*\(/ },
  { code: 'CODE_SHELL_ESCAPE', pattern: /\bsystem\s*\(|\bpopen\s*\(/ },
  { code: 'CODE_PIP_INSTALL', pattern: /\bpip\s+install\b|\bconda\s+install\b/ },
];

const normalizeIdentifier = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.replace(/"/g, '').toLowerCase();
  if (value.schema && value.name) return `${normalizeIdentifier(value.schema)}.${normalizeIdentifier(value.name)}`;
  if (value.name) return normalizeIdentifier(value.name);
  return null;
};

const stripTrailingSemicolon = (sql) => sql.trim().replace(/;\s*$/, '').trim();

const stripPythonStringsAndComments = (code = '') => {
  let output = '';
  let index = 0;
  let quote = null;
  let tripleQuote = false;
  let escaped = false;

  while (index < code.length) {
    const char = code[index];
    const nextThree = code.slice(index, index + 3);

    if (quote) {
      if (escaped) {
        escaped = false;
        index += 1;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        index += 1;
        continue;
      }
      if (tripleQuote && nextThree === quote.repeat(3)) {
        output += ' ';
        index += 3;
        quote = null;
        tripleQuote = false;
        continue;
      }
      if (!tripleQuote && char === quote) {
        output += ' ';
        index += 1;
        quote = null;
        continue;
      }
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    if (char === '#') {
      while (index < code.length && code[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      continue;
    }

    if (nextThree === '"""' || nextThree === "'''") {
      quote = char;
      tripleQuote = true;
      output += ' ';
      index += 3;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tripleQuote = false;
      output += ' ';
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
};

const hasMultipleStatements = (sql) => stripTrailingSemicolon(sql).includes(';');

const readLimitValue = (statement) => {
  const limitNode = statement?.limit?.limit;
  if (!limitNode) return null;
  if (limitNode.type === 'integer') return Number(limitNode.value);
  return null;
};

const collectCteAliases = (statement, aliases = new Set()) => {
  if (statement?.type !== 'with') return aliases;
  (statement.bind || []).forEach((binding) => {
    const alias = normalizeIdentifier(binding.alias);
    if (alias) aliases.add(alias);
  });
  return aliases;
};

const collectAstFacts = (node, facts = { sources: new Set(), functions: new Set() }) => {
  if (!node || typeof node !== 'object') return facts;

  if (node.type === 'table') {
    const source = normalizeIdentifier(node.name);
    if (source) facts.sources.add(source);
  }

  if (node.type === 'call') {
    const functionName = normalizeIdentifier(node.function);
    if (functionName) facts.functions.add(functionName);
  }

  Object.values(node).forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => collectAstFacts(item, facts));
    } else if (value && typeof value === 'object') {
      collectAstFacts(value, facts);
    }
  });

  return facts;
};

const assertReadOnlyStatement = (statement, cteAliases = new Set()) => {
  if (!statement) {
    return { ok: false, code: 'SQL_EMPTY_STATEMENT', message: 'Generated SQL did not produce a statement' };
  }

  if (statement.type === 'with') {
    const aliases = collectCteAliases(statement, new Set(cteAliases));
    for (const binding of statement.bind || []) {
      const result = assertReadOnlyStatement(binding.statement, aliases);
      if (!result.ok) return result;
    }
    return assertReadOnlyStatement(statement.in, aliases);
  }

  if (statement.type !== 'select') {
    return {
      ok: false,
      code: 'SQL_NOT_READ_ONLY_SELECT',
      message: `Generated SQL must be SELECT or WITH ... SELECT, received ${statement.type || 'unknown'}`,
    };
  }

  return { ok: true, cteAliases };
};

const validateGeneratedSql = (sql, options = {}) => {
  const maxRows = Math.min(Math.max(Number(options.maxRows) || DEFAULT_MAX_ROWS, 1), DEFAULT_MAX_ROWS);
  const allowedSources = new Set(
    (options.allowedSources?.length ? options.allowedSources : DEFAULT_ALLOWED_SQL_SOURCES).map(normalizeIdentifier)
  );

  if (typeof sql !== 'string' || !sql.trim()) {
    return { ok: false, code: 'SQL_REQUIRED', message: 'Generated SQL is required' };
  }

  if (sql.length > (options.maxSqlChars || MAX_SQL_CHARS)) {
    return { ok: false, code: 'SQL_TOO_LARGE', message: 'Generated SQL is too large to validate safely' };
  }

  if (sql.includes('\0')) {
    return { ok: false, code: 'SQL_NULL_BYTE', message: 'Generated SQL contains invalid null bytes' };
  }

  if (hasMultipleStatements(sql)) {
    return { ok: false, code: 'SQL_MULTIPLE_STATEMENTS', message: 'Generated SQL must contain one statement only' };
  }

  const trimmedSql = stripTrailingSemicolon(sql);
  let statements;
  try {
    statements = parse(trimmedSql);
  } catch (error) {
    return { ok: false, code: 'SQL_PARSE_FAILED', message: error.message };
  }

  if (!Array.isArray(statements) || statements.length !== 1) {
    return { ok: false, code: 'SQL_STATEMENT_COUNT', message: 'Generated SQL must parse to exactly one statement' };
  }

  const statement = statements[0];
  const readOnly = assertReadOnlyStatement(statement);
  if (!readOnly.ok) return readOnly;

  const cteAliases = statement.type === 'with' ? collectCteAliases(statement) : new Set();
  const facts = collectAstFacts(statement);
  const physicalSources = [...facts.sources].filter((source) => !cteAliases.has(source));
  const blockedSources = physicalSources.filter((source) => !allowedSources.has(source));
  if (blockedSources.length) {
    return {
      ok: false,
      code: 'SQL_SOURCE_NOT_ALLOWED',
      message: `Generated SQL references blocked source(s): ${blockedSources.join(', ')}`,
      sources: physicalSources,
    };
  }

  const blockedFunctions = [...facts.functions].filter((functionName) => !ALLOWED_SQL_FUNCTIONS.has(functionName));
  if (blockedFunctions.length) {
    return {
      ok: false,
      code: 'SQL_FUNCTION_NOT_ALLOWED',
      message: `Generated SQL references blocked function(s): ${blockedFunctions.join(', ')}`,
      functions: [...facts.functions],
    };
  }

  const targetStatement = statement.type === 'with' ? statement.in : statement;
  const limit = readLimitValue(targetStatement);
  if (limit !== null && limit > maxRows) {
    return {
      ok: false,
      code: 'SQL_LIMIT_TOO_HIGH',
      message: `Generated SQL limit ${limit} exceeds maximum ${maxRows}`,
      limit,
      maxRows,
    };
  }

  const boundedSql =
    limit === null ? `SELECT * FROM (${trimmedSql}) AS saby_generated_query LIMIT ${maxRows}` : trimmedSql;

  return {
    ok: true,
    normalizedSql: trimmedSql,
    boundedSql,
    maxRows,
    limit: limit || maxRows,
    sources: physicalSources,
    functions: [...facts.functions],
    astValidated: true,
    readOnly: true,
  };
};

const validateGeneratedCode = (code, options = {}) => {
  const language = (options.language || 'python').toLowerCase();
  if (language !== 'python') {
    return { ok: false, code: 'CODE_LANGUAGE_NOT_ALLOWED', message: 'Only Python analysis snippets are currently allowed' };
  }

  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, code: 'CODE_REQUIRED', message: 'Generated code is required' };
  }

  if (code.length > (options.maxCodeChars || MAX_CODE_CHARS)) {
    return { ok: false, code: 'CODE_TOO_LARGE', message: 'Generated code is too large to validate safely' };
  }

  const codeForPolicy = stripPythonStringsAndComments(code);

  if (options.disallowImports && /\b(import|from)\s+[a-zA-Z_][\w.]*/.test(codeForPolicy)) {
    return {
      ok: false,
      code: 'CODE_IMPORT_NOT_ALLOWED',
      message: 'Imports are disabled for the configured restricted sandbox runtime',
    };
  }

  const blocked = BLOCKED_CODE_PATTERNS.find((rule) => rule.pattern.test(codeForPolicy));
  if (blocked) {
    return {
      ok: false,
      code: blocked.code,
      message: 'Generated code contains a blocked operation for the analysis sandbox',
    };
  }

  return {
    ok: true,
    language,
    sandboxRequired: true,
    networkAllowed: false,
    filesystemAccess: 'sandbox_input_output_only',
  };
};

const getGeneratedAnalysisMode = () => {
  const mode = String(process.env.EXECUTIVE_INTELLIGENCE_GENERATED_ANALYSIS || 'disabled').toLowerCase();
  if (['disabled', 'proposal_only', 'sandbox_readonly'].includes(mode)) return mode;
  return 'disabled';
};

const getPolicySnapshot = () => {
  const mode = getGeneratedAnalysisMode();
  const sandboxExecutionAllowed =
    process.env.EXECUTIVE_INTELLIGENCE_ENABLE_SANDBOX === 'true' &&
    String(process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_PROVIDER || '').toLowerCase() === 'external_http';
  return {
    mode,
    generated_sql_allowed: mode !== 'disabled',
    generated_code_allowed: mode === 'sandbox_readonly',
    generated_code_execution_allowed: mode === 'sandbox_readonly' && sandboxExecutionAllowed,
    sandbox_execution_allowed: sandboxExecutionAllowed,
    raw_sql_from_client_allowed: false,
    ast_validation_required: true,
    approved_sql_sources: DEFAULT_ALLOWED_SQL_SOURCES,
    max_rows: DEFAULT_MAX_ROWS,
    supported_code_runtimes: ['python'],
    note:
      mode === 'sandbox_readonly' && sandboxExecutionAllowed
        ? 'Generated Python analysis is enabled only through the isolated sandbox worker and internal Intelligence tools.'
        : mode === 'sandbox_readonly'
        ? 'Generated Python validation is enabled, but sandbox execution is disabled by server policy.'
        : 'Generated analysis is disabled unless explicitly enabled by server policy.',
  };
};

module.exports = {
  DEFAULT_ALLOWED_SQL_SOURCES,
  validateGeneratedSql,
  validateGeneratedCode,
  getPolicySnapshot,
};
