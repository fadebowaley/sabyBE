const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

const REPORT_SCHEMA_VERSION = '1.0';
const REPORT_ARTIFACT_VERSION = 'phase_8_canonical_report_v1';
const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/;

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const compact = (items = [], limit = 50) =>
  safeArray(items)
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== null && item !== undefined && item !== '')
    .slice(0, limit);

const stringify = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
};

const humanize = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return stringify(value);
};

const escapeSpreadsheetValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
  const text = stringify(value);
  if (SPREADSHEET_FORMULA_PREFIX.test(text)) return `'${text}`;
  return text;
};

const escapeCsvValue = (value) => {
  const text = stringify(escapeSpreadsheetValue(value));
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const safeFilenamePart = (value) => {
  const text = String(value || 'intelligence-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return text || 'intelligence-report';
};

const createExportMetadata = ({ reportModel = {}, format }) => {
  const extensionMap = {
    csv: 'csv',
    xlsx: 'xlsx',
    html: 'html',
    pdf: 'pdf',
    docx: 'docx',
  };
  const extension = extensionMap[format] || 'csv';
  const randomKey = crypto.randomUUID().replace(/-/g, '');
  const tenantPart = safeFilenamePart(reportModel.scope?.tenant_id || 'tenant');
  const titlePart = safeFilenamePart(reportModel.title || reportModel.report_id);
  const filename = `${titlePart}-${reportModel.report_id || randomKey}.${extension}`;
  return {
    filename,
    storage_key: `intelligence/reports/${tenantPart}/${reportModel.report_id || randomKey}/${randomKey}.${extension}`,
    generated_at: new Date().toISOString(),
  };
};

const escapeHtml = (value) =>
  stringify(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createReportId = ({ context = {}, kind }) => {
  const seed = [context.request_id, context.tenant_id, kind, context.artifact_version].filter(Boolean).join(':');
  const hash = crypto.createHash('sha256').update(seed || `${kind}:${Date.now()}`).digest('hex').slice(0, 16);
  return `report_${hash}`;
};

const resolveSelectedReference = (context = {}) => safeArray(context.selected_references)[0] || {};

const resolveDataAccess = (data = {}) => safeObject(data.data_access);

const resolveTitle = ({ kind, title, context = {}, data = {} }) => {
  if (title) return title;
  const reference = resolveSelectedReference(context);
  const subject = reference.title || safeArray(data.columns)[0]?.label || 'Project form';
  const titles = {
    report: `${subject} report`,
    analysis: `${subject} analysis`,
    aggregation: `${subject} breakdown`,
    ranking: `${subject} ranking`,
    trend: `${subject} trend`,
    comparison: `${subject} comparison`,
    anomaly: `${subject} anomaly review`,
  };
  return titles[kind] || `${subject} intelligence report`;
};

const resolveSubtitle = ({ kind, subtitle, data = {} }) => {
  if (subtitle) return subtitle;
  if (kind === 'trend') return `${humanize(data.trend?.aggregate || 'metric')} by ${data.trend?.grain || 'period'}`;
  if (kind === 'comparison') return `${humanize(data.comparison?.aggregate || 'metric')} period comparison`;
  if (kind === 'anomaly') return `${humanize(data.anomaly_detection?.aggregate || 'metric')} anomaly detection`;
  if (kind === 'ranking') return `${humanize(data.ranking?.direction || 'top')} ${data.ranking?.dimension?.label || 'groups'}`;
  if (kind === 'aggregation') return `${humanize(data.aggregation?.aggregate || 'metric')} by ${data.aggregation?.dimension?.label || 'dimension'}`;
  return 'Generated by Saby Intelligence';
};

const buildScope = ({ context = {}, dataAccess = {} }) => ({
  tenant_id: context.tenant_id || null,
  scope_type: dataAccess.scope_type || context.scope_snapshot?.scope_type || null,
  selected_project_ids: dataAccess.selected_project_ids || context.selected_project_ids || [],
  selected_form_ids: dataAccess.selected_form_ids || context.selected_form_ids || [],
  selected_references: safeArray(context.selected_references).map((reference) => ({
    type: reference.type || 'project_form',
    project_id: reference.project_id || null,
    project_form_id: reference.project_form_id || null,
    workspace_id: reference.workspace_id || null,
    title: reference.title || null,
    status: reference.status || null,
  })),
  visible_node_count: dataAccess.visible_node_count || context.scope_snapshot?.visible_node_ids?.length || 0,
});

const resolveDataFreshness = (data = {}) => {
  const candidates = [];
  safeArray(data.rows).forEach((row) => {
    candidates.push(row.submitted_at, row.created_at, row.updated_at, row.period_start);
  });
  safeArray(data.trend_rows).forEach((row) => candidates.push(row.period_start));
  safeArray(data.periods).forEach((period) => candidates.push(period.end, period.start));
  const valid = candidates
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    latest_source_timestamp: valid[0]?.toISOString() || null,
    freshness_source: valid.length ? 'source_rows' : 'not_available',
  };
};

const buildAudit = ({ context = {}, executionPlan = {}, dataAccess = {} }) => ({
  request_id: dataAccess.request_id || context.request_id || null,
  artifact_version: dataAccess.artifact_version || context.artifact_version || null,
  report_artifact_version: REPORT_ARTIFACT_VERSION,
  generated_at: new Date().toISOString(),
  execution_mode: executionPlan.execution_mode || null,
  execution_plan_id: executionPlan.plan_id || null,
  tool_keys: safeArray(executionPlan.stages).map((stage) => stage.tool_key).filter(Boolean),
  data_tool: dataAccess.tool || null,
  read_only: dataAccess.read_only !== false,
  raw_sql_allowed: dataAccess.raw_sql_allowed === true,
  generated_code_allowed: dataAccess.generated_code_allowed === true,
  sandbox_used: dataAccess.sandbox_used === true,
});

const buildAppliedFilters = ({ context = {}, dataAccess = {}, data = {} }) => ({
  semantic_filters: dataAccess.resolved_filters || context.semantic_resolution?.resolved_filters || [],
  time_range: dataAccess.resolved_time_range || context.semantic_resolution?.resolved_time_range || context.resolved_time_range || null,
  time_fields: dataAccess.resolved_time_fields || context.semantic_resolution?.resolved_time_fields || [],
  query_context: data.query_context || {},
});

const buildExecutiveSummary = ({ kind, data = {} }) => {
  if (kind === 'report') {
    return [
      `Retrieved ${formatValue(data.total)} matching submission rows with ${safeArray(data.rows).length} rows included in this bounded result.`,
    ];
  }
  if (kind === 'analysis') {
    return [
      `Profiled ${formatValue(data.dataset_profile?.sampled_rows)} sampled rows across ${formatValue(data.dataset_profile?.analyzed_column_count)} analyzable columns.`,
    ];
  }
  if (kind === 'aggregation') {
    return [`Grouped the selected form into ${formatValue(data.total_groups)} result groups.`];
  }
  if (kind === 'ranking') {
    return [`Ranked ${formatValue(data.total_groups)} groups using the selected metric and dimension.`];
  }
  if (kind === 'trend') {
    return [`Built a ${data.trend?.grain || 'period'} trend with ${formatValue(data.total_periods)} periods.`];
  }
  if (kind === 'comparison') {
    return [`Compared ${safeArray(data.periods).length} periods and found a ${data.change?.direction || 'flat'} movement.`];
  }
  if (kind === 'anomaly') {
    return [`Reviewed ${formatValue(data.total_periods)} periods and detected ${formatValue(data.total_anomalies)} anomalies.`];
  }
  return ['Generated an Intelligence report from the selected tenant-scoped data.'];
};

const buildKeyFindings = ({ kind, data = {} }) => {
  if (kind === 'comparison') {
    return compact([
      `Change direction: ${data.change?.direction || 'flat'}`,
      data.change?.absolute !== undefined ? `Absolute change: ${formatValue(data.change.absolute)}` : null,
      data.change?.percent !== undefined && data.change?.percent !== null
        ? `Percent change: ${formatValue(Number(data.change.percent) * 100)}%`
        : null,
    ]);
  }
  if (kind === 'anomaly') {
    return safeArray(data.anomalies).length
      ? safeArray(data.anomalies).slice(0, 5).map((item) => `${humanize(item.severity)} ${item.direction} at ${item.period_start}`)
      : ['No anomalies were detected in the available periods.'];
  }
  if (kind === 'trend') {
    const rows = safeArray(data.rows);
    const last = rows[rows.length - 1];
    return compact([
      rows.length ? `Latest period: ${last?.period_start || 'not available'} = ${formatValue(last?.aggregate_value)}` : null,
      rows.length ? `Periods returned: ${rows.length}` : null,
    ]);
  }
  if (kind === 'ranking' || kind === 'aggregation') {
    return safeArray(data.rows)
      .slice(0, 5)
      .map((row, index) => `${kind === 'ranking' ? `#${row.rank || index + 1}` : `Group ${index + 1}`}: ${formatValue(row.dimension_value || row.label || row.key)} = ${formatValue(row.aggregate_value)}`);
  }
  if (kind === 'analysis') return compact(data.recommended_followups || [], 5);
  return [];
};

const metricFromAggregation = (payload = {}) => ({
  label: payload.metric?.label || (payload.aggregate === 'count' ? 'Submission count' : 'Metric'),
  value: null,
  aggregate: payload.aggregate || null,
  dimension: payload.dimension?.label || null,
});

const buildMetrics = ({ kind, data = {} }) => {
  if (kind === 'report') {
    return [
      { label: 'Total rows', value: data.total || 0 },
      { label: 'Returned rows', value: safeArray(data.rows).length },
      { label: 'Columns', value: safeArray(data.columns).length },
    ];
  }
  if (kind === 'analysis') {
    const profile = data.dataset_profile || {};
    return [
      { label: 'Total rows', value: profile.total_rows || 0 },
      { label: 'Sampled rows', value: profile.sampled_rows || 0 },
      { label: 'Numeric columns', value: profile.numeric_column_count || 0 },
      { label: 'Categorical columns', value: profile.categorical_column_count || 0 },
    ];
  }
  if (kind === 'aggregation') return [metricFromAggregation(data.aggregation || {})];
  if (kind === 'ranking') return [metricFromAggregation(data.ranking || {})];
  if (kind === 'trend') return [metricFromAggregation(data.trend || {})];
  if (kind === 'comparison') return [metricFromAggregation(data.comparison || {})];
  if (kind === 'anomaly') {
    return [
      metricFromAggregation(data.anomaly_detection || {}),
      { label: 'Anomalies', value: data.total_anomalies || 0 },
    ];
  }
  return [];
};

const buildSupportingTables = ({ kind, data = {} }) => {
  if (kind === 'report') {
    return [
      {
        title: 'Submission sample',
        columns: safeArray(data.columns).map((column) => ({ key: column.key, label: column.label || column.key })),
        rows: safeArray(data.rows),
        total_rows: data.total || safeArray(data.rows).length,
      },
    ];
  }
  if (kind === 'analysis') {
    return [
      {
        title: 'Column profile',
        columns: [
          { key: 'label', label: 'Column' },
          { key: 'type', label: 'Type' },
          { key: 'non_empty_count', label: 'Non-empty' },
          { key: 'empty_count', label: 'Empty' },
        ],
        rows: safeArray(data.columns),
        total_rows: safeArray(data.columns).length,
      },
    ];
  }
  if (['aggregation', 'ranking', 'trend'].includes(kind)) {
    return [
      {
        title: humanize(kind),
        columns: Object.keys(safeArray(data.rows)[0] || {}).map((key) => ({ key, label: humanize(key) })),
        rows: safeArray(data.rows),
        total_rows: data.total_groups || data.total_periods || safeArray(data.rows).length,
      },
    ];
  }
  if (kind === 'comparison') {
    return [
      {
        title: 'Compared periods',
        columns: Object.keys(safeArray(data.periods)[0] || {}).map((key) => ({ key, label: humanize(key) })),
        rows: safeArray(data.periods),
        total_rows: safeArray(data.periods).length,
      },
    ];
  }
  if (kind === 'anomaly') {
    return [
      {
        title: 'Detected anomalies',
        columns: Object.keys(safeArray(data.anomalies)[0] || {}).map((key) => ({ key, label: humanize(key) })),
        rows: safeArray(data.anomalies),
        total_rows: safeArray(data.anomalies).length,
      },
    ];
  }
  return [];
};

const buildEvidenceReferences = (data = {}) => {
  const evidence = safeObject(data.evidence);
  return compact([
    evidence.source_endpoint ? { type: 'endpoint', value: evidence.source_endpoint } : null,
    evidence.source_table ? { type: 'table', value: evidence.source_table } : null,
    evidence.source_join ? { type: 'join', value: evidence.source_join } : null,
    evidence.time_source ? { type: 'time_source', value: evidence.time_source } : null,
    safeArray(evidence.sampled_submission_ids).length
      ? { type: 'sampled_submission_ids', value: safeArray(evidence.sampled_submission_ids) }
      : null,
  ]);
};

const buildLimitations = ({ dataAccess = {}, data = {} }) =>
  compact([
    ...safeArray(dataAccess.caveats),
    ...safeArray(dataAccess.assumptions),
    data.total !== undefined && safeArray(data.rows).length < Number(data.total || 0)
      ? 'Result is bounded and may not include every matching row.'
      : null,
  ], 25);

const buildCanonicalReportModel = ({ kind = 'report', title, subtitle, context = {}, executionPlan = {}, data = {} }) => {
  const dataAccess = resolveDataAccess(data);
  const reportTitle = resolveTitle({ kind, title, context, data });
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    report_id: createReportId({ context, kind }),
    title: reportTitle,
    subtitle: resolveSubtitle({ kind, subtitle, data }),
    kind,
    scope: buildScope({ context, dataAccess }),
    data_freshness: resolveDataFreshness(data),
    applied_filters: buildAppliedFilters({ context, dataAccess, data }),
    confidentiality: 'tenant_internal',
    executive_summary: buildExecutiveSummary({ kind, data }),
    health: {
      status: safeArray(dataAccess.caveats).length ? 'qualified' : 'complete',
      caveat_count: safeArray(dataAccess.caveats).length,
    },
    key_findings: buildKeyFindings({ kind, data }),
    wins: [],
    risks: [],
    metrics: buildMetrics({ kind, data }),
    trends: kind === 'trend' ? safeArray(data.rows) : kind === 'anomaly' ? safeArray(data.trend_rows) : [],
    anomalies: kind === 'anomaly' ? safeArray(data.anomalies) : [],
    comparisons: kind === 'comparison' ? [{ periods: safeArray(data.periods), change: data.change || {} }] : [],
    root_cause_hypotheses: [],
    recommendations: [],
    limitations: buildLimitations({ dataAccess, data }),
    methodology: [
      'Facts were retrieved through approved read-only Intelligence tools.',
      'The renderer formats deterministic tool output and does not recalculate metrics.',
    ],
    supporting_tables: buildSupportingTables({ kind, data }),
    charts: [],
    suggested_follow_ups: compact(data.recommended_followups || [], 10),
    evidence_references: buildEvidenceReferences(data),
    audit: buildAudit({ context, executionPlan, dataAccess }),
  };
};

const markdownTable = (table = {}) => {
  const columns = safeArray(table.columns).slice(0, 8);
  const rows = safeArray(table.rows).slice(0, 10);
  if (!columns.length || !rows.length) return '';
  const header = `| ${columns.map((column) => column.label || column.key).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => formatValue(row[column.key])).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
};

const bulletList = (items = []) => safeArray(items).map((item) => `- ${stringify(item)}`).join('\n');

const renderMarkdown = (reportModel = {}) => {
  const lines = [
    `# ${reportModel.title || 'Intelligence report'}`,
    reportModel.subtitle ? `_${reportModel.subtitle}_` : null,
    '',
    '## Executive summary',
    bulletList(reportModel.executive_summary || []) || '- No executive summary available.',
    '',
    '## Scope and audit',
    `- Tenant: ${formatValue(reportModel.scope?.tenant_id)}`,
    `- Scope: ${formatValue(reportModel.scope?.scope_type)}`,
    `- Projects: ${safeArray(reportModel.scope?.selected_project_ids).join(', ') || 'None'}`,
    `- Forms: ${safeArray(reportModel.scope?.selected_form_ids).join(', ') || 'None'}`,
    `- Request ID: ${formatValue(reportModel.audit?.request_id)}`,
    `- Generated: ${formatValue(reportModel.audit?.generated_at)}`,
    `- Read-only: ${reportModel.audit?.read_only ? 'Yes' : 'No'}`,
    '',
    '## Key findings',
    bulletList(reportModel.key_findings || []) || '- No key findings available.',
    '',
    '## Metrics',
    bulletList(safeArray(reportModel.metrics).map((metric) => `${metric.label}: ${formatValue(metric.value)}${metric.aggregate ? ` (${metric.aggregate})` : ''}`)) || '- No metrics available.',
  ].filter((line) => line !== null && line !== undefined);

  if (safeArray(reportModel.comparisons).length) {
    lines.push('', '## Comparisons', bulletList(reportModel.comparisons.map((item) => item.change || item)) || '- No comparisons available.');
  }
  if (safeArray(reportModel.trends).length) {
    lines.push('', '## Trends', markdownTable({ title: 'Trends', columns: Object.keys(reportModel.trends[0] || {}).map((key) => ({ key, label: humanize(key) })), rows: reportModel.trends }) || '- No trend rows available.');
  }
  if (safeArray(reportModel.anomalies).length) {
    lines.push('', '## Anomalies', markdownTable({ title: 'Anomalies', columns: Object.keys(reportModel.anomalies[0] || {}).map((key) => ({ key, label: humanize(key) })), rows: reportModel.anomalies }) || '- No anomalies available.');
  }

  lines.push('', '## Supporting tables');
  const tableSections = safeArray(reportModel.supporting_tables)
    .map((table) => [`### ${table.title || 'Table'}`, markdownTable(table) || '- No rows available.'].join('\n'))
    .join('\n\n');
  lines.push(tableSections || '- No supporting tables available.');

  lines.push(
    '',
    '## Limitations',
    bulletList(reportModel.limitations || []) || '- No limitations recorded.',
    '',
    '## Methodology',
    bulletList(reportModel.methodology || []) || '- No methodology recorded.',
    '',
    '## Suggested follow-ups',
    bulletList(reportModel.suggested_follow_ups || []) || '- No follow-ups suggested.'
  );

  return `${lines.join('\n')}\n`;
};

const renderJson = (reportModel = {}) => JSON.parse(JSON.stringify(reportModel));

const metadataRows = (reportModel = {}) => [
  ['Report title', reportModel.title],
  ['Subtitle', reportModel.subtitle],
  ['Tenant', reportModel.scope?.tenant_id],
  ['Scope', reportModel.scope?.scope_type],
  ['Projects', safeArray(reportModel.scope?.selected_project_ids).join(', ')],
  ['Forms', safeArray(reportModel.scope?.selected_form_ids).join(', ')],
  ['Generated at', reportModel.audit?.generated_at],
  ['Request ID', reportModel.audit?.request_id],
  ['Artifact version', reportModel.audit?.artifact_version],
  ['Report artifact version', reportModel.audit?.report_artifact_version],
  ['Confidentiality', reportModel.confidentiality],
  ['Read-only', reportModel.audit?.read_only ? 'Yes' : 'No'],
  ['Data freshness', reportModel.data_freshness?.latest_source_timestamp || 'Not available'],
];

const csvSection = (title, rows = []) => {
  const lines = [[title], ...rows].map((row) => safeArray(row).map(escapeCsvValue).join(','));
  return lines.join('\n');
};

const tableToCsvRows = (table = {}) => {
  const columns = safeArray(table.columns);
  const rows = safeArray(table.rows);
  if (!columns.length) return [];
  return [
    columns.map((column) => column.label || column.key),
    ...rows.map((row) => columns.map((column) => row?.[column.key])),
  ];
};

const renderCsv = (reportModel = {}) => {
  const sections = [
    csvSection('Saby Intelligence Report', metadataRows(reportModel)),
    csvSection('Executive Summary', safeArray(reportModel.executive_summary).map((item) => [item])),
    csvSection('Key Findings', safeArray(reportModel.key_findings).map((item) => [item])),
    csvSection(
      'Metrics',
      [
        ['Metric', 'Value', 'Aggregate', 'Dimension'],
        ...safeArray(reportModel.metrics).map((metric) => [
          metric.label,
          metric.value,
          metric.aggregate,
          metric.dimension,
        ]),
      ]
    ),
    ...safeArray(reportModel.supporting_tables).map((table) =>
      csvSection(table.title || 'Supporting Table', tableToCsvRows(table))
    ),
    csvSection('Limitations', safeArray(reportModel.limitations).map((item) => [item])),
    csvSection('Methodology', safeArray(reportModel.methodology).map((item) => [item])),
  ];
  const content = `${sections.filter(Boolean).join('\n\n')}\n`;
  const metadata = createExportMetadata({ reportModel, format: 'csv' });
  return {
    format: 'csv',
    content_type: 'text/csv; charset=utf-8',
    content,
    byte_size: Buffer.byteLength(content, 'utf8'),
    ...metadata,
  };
};

const safeWorksheetName = (name, fallback = 'Sheet') => {
  const safe = String(name || fallback)
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return safe || fallback;
};

const addRows = (worksheet, rows = []) => {
  rows.forEach((row) => worksheet.addRow(safeArray(row).map(escapeSpreadsheetValue)));
};

const styleHeaderRow = (row) => {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFEFEF' },
  };
};

const autosizeWorksheet = (worksheet) => {
  worksheet.columns.forEach((column) => {
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const text = stringify(cell.value);
      max = Math.max(max, Math.min(text.length + 2, 48));
    });
    column.width = max;
  });
};

const addTableWorksheet = ({ workbook, table, fallbackName }) => {
  const worksheet = workbook.addWorksheet(safeWorksheetName(table.title, fallbackName));
  const columns = safeArray(table.columns);
  if (!columns.length) {
    worksheet.addRow(['No rows available']);
    return;
  }
  const header = worksheet.addRow(columns.map((column) => escapeSpreadsheetValue(column.label || column.key)));
  styleHeaderRow(header);
  safeArray(table.rows).forEach((row) => {
    worksheet.addRow(columns.map((column) => escapeSpreadsheetValue(row?.[column.key])));
  });
  autosizeWorksheet(worksheet);
};

const renderXlsx = async (reportModel = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Saby Intelligence';
  workbook.created = new Date(reportModel.audit?.generated_at || Date.now());
  workbook.modified = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Saby Intelligence Report']);
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.addRow([]);
  addRows(summary, metadataRows(reportModel));
  summary.addRow([]);
  summary.addRow(['Executive Summary']);
  styleHeaderRow(summary.lastRow);
  addRows(summary, safeArray(reportModel.executive_summary).map((item) => [item]));
  summary.addRow([]);
  summary.addRow(['Key Findings']);
  styleHeaderRow(summary.lastRow);
  addRows(summary, safeArray(reportModel.key_findings).map((item) => [item]));
  summary.addRow([]);
  summary.addRow(['Limitations']);
  styleHeaderRow(summary.lastRow);
  addRows(summary, safeArray(reportModel.limitations).map((item) => [item]));
  autosizeWorksheet(summary);

  const metrics = workbook.addWorksheet('Metrics');
  const metricHeader = metrics.addRow(['Metric', 'Value', 'Aggregate', 'Dimension']);
  styleHeaderRow(metricHeader);
  addRows(
    metrics,
    safeArray(reportModel.metrics).map((metric) => [
      metric.label,
      metric.value,
      metric.aggregate,
      metric.dimension,
    ])
  );
  autosizeWorksheet(metrics);

  safeArray(reportModel.supporting_tables).forEach((table, index) => {
    addTableWorksheet({ workbook, table, fallbackName: `Table ${index + 1}` });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const metadata = createExportMetadata({ reportModel, format: 'xlsx' });
  return {
    format: 'xlsx',
    content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content_base64: Buffer.from(buffer).toString('base64'),
    byte_size: buffer.byteLength,
    ...metadata,
  };
};

const renderHtmlTable = (table = {}) => {
  const columns = safeArray(table.columns);
  const rows = safeArray(table.rows);
  if (!columns.length || !rows.length) {
    return '<p class="empty">No rows available.</p>';
  }
  const head = columns
    .map((column) => `<th>${escapeHtml(column.label || column.key)}</th>`)
    .join('');
  const body = rows
    .slice(0, 100)
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatValue(row?.[column.key]))}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
};

const renderHtmlList = (items = [], emptyText = 'No items available.') => {
  const safeItems = safeArray(items);
  if (!safeItems.length) return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  return `<ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const renderHtml = (reportModel = {}) => {
  const metricCards = safeArray(reportModel.metrics)
    .map(
      (metric) => `
        <article class="metric-card">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(formatValue(metric.value))}</strong>
          <small>${escapeHtml([metric.aggregate, metric.dimension].filter(Boolean).join(' / '))}</small>
        </article>`
    )
    .join('');
  const supportingTables = safeArray(reportModel.supporting_tables)
    .map(
      (table) => `
        <section class="section">
          <div class="section-heading">
            <h2>${escapeHtml(table.title || 'Supporting table')}</h2>
            <span>${escapeHtml(formatValue(table.total_rows))} rows</span>
          </div>
          ${renderHtmlTable(table)}
        </section>`
    )
    .join('');
  const content = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(reportModel.title || 'Saby Intelligence Report')}</title>
  <style>
    :root { color-scheme: light; --ink:#111111; --muted:#687386; --line:#e6e8ec; --soft:#f5f6f8; --black:#050505; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #ededed; color: var(--ink); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    .frame { max-width: 1120px; margin: 0 auto; padding: 40px 24px; }
    .report { background: #fff; border: 1px solid var(--line); border-radius: 28px; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,.08); }
    .hero { padding: 44px 52px 32px; border-bottom: 1px solid var(--line); }
    .brand { width: 64px; height: 64px; border-radius: 18px; background: var(--black); color: #fff; display: grid; place-items: center; font-weight: 800; letter-spacing: -.08em; margin-bottom: 28px; }
    h1 { font-size: clamp(34px, 5vw, 64px); line-height: .95; letter-spacing: -.055em; margin: 0 0 12px; }
    h2 { font-size: 22px; line-height: 1.1; margin: 0; letter-spacing: -.03em; }
    p { margin: 0; }
    .subtitle { color: var(--muted); font-size: 18px; max-width: 760px; }
    .meta-grid, .metrics { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
    .meta { padding: 14px 16px; background: var(--soft); border: 1px solid var(--line); border-radius: 16px; }
    .meta span, .metric-card span, .section-heading span { display:block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .meta strong { display:block; overflow-wrap:anywhere; }
    .content { padding: 36px 52px 52px; display: grid; gap: 28px; }
    .section { border: 1px solid var(--line); border-radius: 22px; padding: 24px; background: #fff; }
    .section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .metric-card { padding: 20px; border-radius: 20px; background: var(--black); color:#fff; min-height: 128px; display:flex; flex-direction:column; justify-content:space-between; }
    .metric-card span, .metric-card small { color: rgba(255,255,255,.68); }
    .metric-card strong { font-size: 30px; letter-spacing: -.04em; }
    ul { margin: 0; padding-left: 20px; }
    li + li { margin-top: 8px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 16px; }
    table { width: 100%; border-collapse: collapse; min-width: 520px; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: var(--soft); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    tr:last-child td { border-bottom: 0; }
    .empty { color: var(--muted); }
    .footer { padding: 22px 52px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    @media (max-width: 720px) { .frame { padding: 16px; } .hero, .content, .footer { padding-left: 22px; padding-right: 22px; } .section-heading { display:block; } }
  </style>
</head>
<body>
  <main class="frame">
    <article class="report">
      <header class="hero">
        <div class="brand">S</div>
        <h1>${escapeHtml(reportModel.title || 'Saby Intelligence Report')}</h1>
        <p class="subtitle">${escapeHtml(reportModel.subtitle || 'Generated by Saby Intelligence')}</p>
      </header>
      <div class="content">
        <section class="meta-grid" aria-label="Report metadata">
          <div class="meta"><span>Tenant</span><strong>${escapeHtml(reportModel.scope?.tenant_id || 'Not available')}</strong></div>
          <div class="meta"><span>Scope</span><strong>${escapeHtml(reportModel.scope?.scope_type || 'Not available')}</strong></div>
          <div class="meta"><span>Request ID</span><strong>${escapeHtml(reportModel.audit?.request_id || 'Not available')}</strong></div>
          <div class="meta"><span>Generated</span><strong>${escapeHtml(reportModel.audit?.generated_at || 'Not available')}</strong></div>
          <div class="meta"><span>Freshness</span><strong>${escapeHtml(reportModel.data_freshness?.latest_source_timestamp || 'Not available')}</strong></div>
          <div class="meta"><span>Confidentiality</span><strong>${escapeHtml(reportModel.confidentiality || 'tenant_internal')}</strong></div>
        </section>
        <section class="section">
          <div class="section-heading"><h2>Executive Summary</h2></div>
          ${renderHtmlList(reportModel.executive_summary, 'No executive summary available.')}
        </section>
        <section class="section">
          <div class="section-heading"><h2>Key Findings</h2></div>
          ${renderHtmlList(reportModel.key_findings, 'No key findings available.')}
        </section>
        <section class="metrics" aria-label="Metrics">${metricCards || '<p class="empty">No metrics available.</p>'}</section>
        ${supportingTables || '<section class="section"><h2>Supporting Tables</h2><p class="empty">No supporting tables available.</p></section>'}
        <section class="section">
          <div class="section-heading"><h2>Limitations</h2></div>
          ${renderHtmlList(reportModel.limitations, 'No limitations recorded.')}
        </section>
        <section class="section">
          <div class="section-heading"><h2>Methodology</h2></div>
          ${renderHtmlList(reportModel.methodology, 'No methodology recorded.')}
        </section>
      </div>
      <footer class="footer">
        <span>Saby Intelligence</span>
        <span>Artifact ${escapeHtml(reportModel.audit?.report_artifact_version || REPORT_ARTIFACT_VERSION)}</span>
      </footer>
    </article>
  </main>
</body>
</html>`;
  const metadata = createExportMetadata({ reportModel, format: 'html' });
  return {
    format: 'html',
    content_type: 'text/html; charset=utf-8',
    content,
    byte_size: Buffer.byteLength(content, 'utf8'),
    ...metadata,
  };
};

const renderPdf = async (reportModel = {}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: stringify(reportModel.title || 'Saby Intelligence Report'),
        Author: 'Saby Intelligence',
        Subject: stringify(reportModel.kind || 'report'),
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const metadata = createExportMetadata({ reportModel, format: 'pdf' });
      resolve({
        format: 'pdf',
        content_type: 'application/pdf',
        content_base64: buffer.toString('base64'),
        byte_size: buffer.byteLength,
        ...metadata,
      });
    });

    const section = (title) => {
      doc.moveDown(1.1);
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111').text(title);
      doc.moveDown(0.35);
    };
    const bullet = (text) => {
      doc.font('Helvetica').fontSize(10.5).fillColor('#222222').text(`- ${stringify(text)}`, {
        indent: 12,
        continued: false,
      });
    };

    doc.rect(0, 0, doc.page.width, 112).fill('#050505');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28).text('Saby Intelligence', 48, 34);
    doc.font('Helvetica').fontSize(10).fillColor('#cfcfcf').text('Tenant internal report', 48, 72);
    doc.moveDown(3);

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(24).text(stringify(reportModel.title), 48, 138, {
      width: 500,
    });
    doc.font('Helvetica').fontSize(11).fillColor('#555555').text(stringify(reportModel.subtitle), {
      width: 500,
    });

    section('Scope and Audit');
    metadataRows(reportModel).forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#333333').text(formatValue(value));
    });

    section('Executive Summary');
    safeArray(reportModel.executive_summary).forEach(bullet);

    section('Key Findings');
    const findings = safeArray(reportModel.key_findings);
    if (findings.length) findings.forEach(bullet);
    else bullet('No key findings available.');

    section('Metrics');
    safeArray(reportModel.metrics).forEach((metric) => {
      bullet(`${metric.label}: ${formatValue(metric.value)}${metric.aggregate ? ` (${metric.aggregate})` : ''}`);
    });

    safeArray(reportModel.supporting_tables).slice(0, 3).forEach((table) => {
      section(table.title || 'Supporting Table');
      const columns = safeArray(table.columns).slice(0, 5);
      if (!columns.length) {
        bullet('No columns available.');
        return;
      }
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
      doc.text(columns.map((column) => column.label || column.key).join(' | '), { width: 500 });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8).fillColor('#333333');
      safeArray(table.rows).slice(0, 18).forEach((row) => {
        doc.text(columns.map((column) => formatValue(row?.[column.key])).join(' | '), { width: 500 });
      });
    });

    section('Limitations');
    const limitations = safeArray(reportModel.limitations);
    if (limitations.length) limitations.forEach(bullet);
    else bullet('No limitations recorded.');

    section('Methodology');
    safeArray(reportModel.methodology).forEach(bullet);

    doc.end();
  });

const paragraph = (text, options = {}) => {
  const { bold, ...paragraphOptions } = options;
  return new Paragraph({
    ...paragraphOptions,
    children: [new TextRun({ text: stringify(text), bold: Boolean(bold) })],
  });
};

const bulletParagraphs = (items = [], emptyText) => {
  const safeItems = safeArray(items);
  const values = safeItems.length ? safeItems : [emptyText];
  return values.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: stringify(item) })],
      })
  );
};

const docxHeading = (text, level = HeadingLevel.HEADING_2) =>
  new Paragraph({
    text: stringify(text),
    heading: level,
    spacing: { before: 320, after: 120 },
  });

const docxTable = (table = {}) => {
  const columns = safeArray(table.columns).slice(0, 6);
  const rows = safeArray(table.rows).slice(0, 25);
  if (!columns.length) return paragraph('No columns available.');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: columns.map(
          (column) =>
            new TableCell({
              children: [paragraph(column.label || column.key, { bold: true })],
            })
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: columns.map(
              (column) =>
                new TableCell({
                  children: [paragraph(formatValue(row?.[column.key]))],
                })
            ),
          })
      ),
    ],
  });
};

const renderDocx = async (reportModel = {}) => {
  const children = [
    new Paragraph({
      text: stringify(reportModel.title || 'Saby Intelligence Report'),
      heading: HeadingLevel.TITLE,
    }),
    paragraph(reportModel.subtitle || 'Generated by Saby Intelligence'),
    docxHeading('Scope and Audit'),
    ...metadataRows(reportModel).map(([label, value]) => paragraph(`${label}: ${formatValue(value)}`)),
    docxHeading('Executive Summary'),
    ...bulletParagraphs(reportModel.executive_summary, 'No executive summary available.'),
    docxHeading('Key Findings'),
    ...bulletParagraphs(reportModel.key_findings, 'No key findings available.'),
    docxHeading('Metrics'),
    ...safeArray(reportModel.metrics).map((metric) =>
      paragraph(`${metric.label}: ${formatValue(metric.value)}${metric.aggregate ? ` (${metric.aggregate})` : ''}`)
    ),
  ];

  safeArray(reportModel.supporting_tables).slice(0, 4).forEach((table) => {
    children.push(docxHeading(table.title || 'Supporting Table'), docxTable(table));
  });

  children.push(
    docxHeading('Limitations'),
    ...bulletParagraphs(reportModel.limitations, 'No limitations recorded.'),
    docxHeading('Methodology'),
    ...bulletParagraphs(reportModel.methodology, 'No methodology recorded.')
  );

  const document = new Document({
    creator: 'Saby Intelligence',
    title: stringify(reportModel.title || 'Saby Intelligence Report'),
    description: stringify(reportModel.subtitle || ''),
    sections: [{ properties: {}, children }],
  });
  const buffer = await Packer.toBuffer(document);
  const metadata = createExportMetadata({ reportModel, format: 'docx' });
  return {
    format: 'docx',
    content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content_base64: buffer.toString('base64'),
    byte_size: buffer.byteLength,
    ...metadata,
  };
};

const renderCanonicalReport = async (reportModel = {}, options = {}) => {
  const format = String(options.format || 'markdown').toLowerCase();
  if (format === 'json') {
    return {
      format: 'json',
      content_type: 'application/json',
      content: renderJson(reportModel),
    };
  }
  if (format === 'csv') return renderCsv(reportModel);
  if (format === 'xlsx' || format === 'excel') return renderXlsx(reportModel);
  if (format === 'html') return renderHtml(reportModel);
  if (format === 'pdf') return renderPdf(reportModel);
  if (format === 'docx') return renderDocx(reportModel);
  if (format !== 'markdown' && format !== 'chat') {
    throw new Error(`Unsupported report render format: ${format}`);
  }
  return {
    format: 'markdown',
    content_type: 'text/markdown',
    content: renderMarkdown(reportModel),
  };
};

module.exports = {
  REPORT_SCHEMA_VERSION,
  REPORT_ARTIFACT_VERSION,
  buildCanonicalReportModel,
  renderCanonicalReport,
  renderMarkdown,
  renderHtml,
  renderPdf,
  renderDocx,
  renderJson,
};
