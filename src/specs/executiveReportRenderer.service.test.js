const executiveReportRenderer = require('../services/executiveReportRenderer.service');

describe('executiveReportRenderer.service', () => {
  const context = {
    request_id: 'req_test_1',
    tenant_id: 'tenant-1',
    artifact_version: 'artifact_1',
    selected_project_ids: ['project-sales'],
    selected_form_ids: ['form-sales'],
    selected_references: [
      {
        type: 'project_form',
        project_id: 'project-sales',
        project_form_id: 'form-sales',
        workspace_id: 'workspace-main',
        title: 'Monthly Sales',
        status: 'active',
      },
    ],
    scope_snapshot: {
      scope_type: 'tenant',
      visible_node_ids: ['node-1', 'node-2'],
    },
    semantic_resolution: {
      resolved_filters: [{ type: 'submission_status', values: ['approved'] }],
      resolved_time_range: { start: '2026-07-01', end: '2026-07-31' },
      caveats: ['bounded_result'],
    },
  };

  const executionPlan = {
    plan_id: 'plan_1',
    execution_mode: 'report',
    stages: [{ tool_key: 'get_project_form_report' }],
  };

  test('builds canonical report model without recalculating source facts', () => {
    const data = {
      total: 3,
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: [
        { submission_id: 'sub-1', status: 'approved', amount: 1200, submitted_at: '2026-07-18T00:00:00.000Z' },
      ],
      evidence: {
        source_endpoint: '/v1/submission-reports/module-table',
        sampled_submission_ids: ['sub-1'],
      },
      data_access: {
        request_id: 'req_test_1',
        artifact_version: 'artifact_1',
        read_only: true,
        raw_sql_allowed: false,
        generated_code_allowed: false,
        tool: 'get_project_form_report',
        selected_project_ids: ['project-sales'],
        selected_form_ids: ['form-sales'],
        scope_type: 'tenant',
        visible_node_count: 2,
        caveats: ['bounded_result'],
      },
    };

    const report = executiveReportRenderer.buildCanonicalReportModel({
      kind: 'report',
      context,
      executionPlan,
      data,
    });

    expect(report).toEqual(
      expect.objectContaining({
        schema_version: '1.0',
        report_id: expect.stringMatching(/^report_/),
        title: 'Monthly Sales report',
        confidentiality: 'tenant_internal',
        audit: expect.objectContaining({
          request_id: 'req_test_1',
          artifact_version: 'artifact_1',
          data_tool: 'get_project_form_report',
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
        }),
      })
    );
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Total rows', value: 3 }),
        expect.objectContaining({ label: 'Returned rows', value: 1 }),
      ])
    );
    expect(report.supporting_tables[0]).toEqual(
      expect.objectContaining({
        title: 'Submission sample',
        total_rows: 3,
      })
    );
    expect(report.limitations).toEqual(expect.arrayContaining(['bounded_result']));
  });

  test('renders canonical report to Markdown and JSON', async () => {
    const report = executiveReportRenderer.buildCanonicalReportModel({
      kind: 'trend',
      context,
      executionPlan: { ...executionPlan, execution_mode: 'trend' },
      data: {
        total_periods: 1,
        trend: { grain: 'month', aggregate: 'sum', metric: { label: 'Amount' } },
        rows: [{ period_start: '2026-07-01T00:00:00.000Z', aggregate_value: 1200 }],
        evidence: { source_table: 'form_submission_facts' },
        data_access: {
          request_id: 'req_test_1',
          artifact_version: 'artifact_1',
          read_only: true,
          tool: 'get_project_form_trend',
        },
      },
    });

    const markdown = await executiveReportRenderer.renderCanonicalReport(report, { format: 'markdown' });
    const json = await executiveReportRenderer.renderCanonicalReport(report, { format: 'json' });

    expect(markdown).toEqual(
      expect.objectContaining({
        format: 'markdown',
        content_type: 'text/markdown',
        content: expect.stringContaining('# Monthly Sales trend'),
      })
    );
    expect(markdown.content).toContain('## Scope and audit');
    expect(markdown.content).toContain('Request ID: req_test_1');
    expect(json).toEqual(
      expect.objectContaining({
        format: 'json',
        content_type: 'application/json',
        content: expect.objectContaining({ report_id: report.report_id }),
      })
    );
  });

  test('renders CSV and XLSX export artifacts with spreadsheet formula escaping', async () => {
    const report = executiveReportRenderer.buildCanonicalReportModel({
      kind: 'report',
      context,
      executionPlan,
      data: {
        total: 1,
        columns: [
          { key: 'branch', label: 'Branch' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [{ branch: '=HYPERLINK("https://evil.test")', amount: 1500 }],
        data_access: {
          request_id: 'req_test_1',
          artifact_version: 'artifact_1',
          read_only: true,
          tool: 'get_project_form_report',
        },
      },
    });

    const csv = await executiveReportRenderer.renderCanonicalReport(report, { format: 'csv' });
    const xlsx = await executiveReportRenderer.renderCanonicalReport(report, { format: 'xlsx' });

    expect(csv).toEqual(
      expect.objectContaining({
        format: 'csv',
        content_type: 'text/csv; charset=utf-8',
        filename: expect.stringMatching(/\.csv$/),
        storage_key: expect.stringContaining('/'),
        byte_size: expect.any(Number),
      })
    );
    expect(csv.content).toContain('\'=HYPERLINK');
    expect(xlsx).toEqual(
      expect.objectContaining({
        format: 'xlsx',
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: expect.stringMatching(/\.xlsx$/),
        storage_key: expect.stringContaining('/'),
        content_base64: expect.any(String),
        byte_size: expect.any(Number),
      })
    );
    expect(Buffer.from(xlsx.content_base64, 'base64').byteLength).toBeGreaterThan(1000);
  });

  test('renders sanitized HTML export artifact without executing user-supplied markup', async () => {
    const report = executiveReportRenderer.buildCanonicalReportModel({
      kind: 'report',
      context,
      executionPlan,
      data: {
        total: 1,
        columns: [
          { key: 'branch', label: '<Branch>' },
          { key: 'comment', label: 'Comment' },
        ],
        rows: [
          {
            branch: '<script>alert("x")</script>',
            comment: '<img src=x onerror=alert(1)>',
          },
        ],
        data_access: {
          request_id: 'req_test_1',
          artifact_version: 'artifact_1',
          read_only: true,
          tool: 'get_project_form_report',
        },
      },
    });

    const html = await executiveReportRenderer.renderCanonicalReport(report, { format: 'html' });

    expect(html).toEqual(
      expect.objectContaining({
        format: 'html',
        content_type: 'text/html; charset=utf-8',
        filename: expect.stringMatching(/\.html$/),
        storage_key: expect.stringContaining('/'),
        byte_size: expect.any(Number),
      })
    );
    expect(html.content).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html.content).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html.content).not.toContain('<script>alert("x")</script>');
    expect(html.content).not.toContain('<img src=x onerror=alert(1)>');
    expect(html.content).toContain("Content-Security-Policy");
  });

  test('renders PDF and DOCX export artifacts from the canonical model', async () => {
    const report = executiveReportRenderer.buildCanonicalReportModel({
      kind: 'report',
      context,
      executionPlan,
      data: {
        total: 1,
        columns: [
          { key: 'branch', label: 'Branch' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [{ branch: 'Lagos', amount: 1500 }],
        data_access: {
          request_id: 'req_test_1',
          artifact_version: 'artifact_1',
          read_only: true,
          tool: 'get_project_form_report',
        },
      },
    });

    const pdf = await executiveReportRenderer.renderCanonicalReport(report, { format: 'pdf' });
    const docx = await executiveReportRenderer.renderCanonicalReport(report, { format: 'docx' });
    const pdfBuffer = Buffer.from(pdf.content_base64, 'base64');
    const docxBuffer = Buffer.from(docx.content_base64, 'base64');

    expect(pdf).toEqual(
      expect.objectContaining({
        format: 'pdf',
        content_type: 'application/pdf',
        filename: expect.stringMatching(/\.pdf$/),
        storage_key: expect.stringContaining('/'),
        byte_size: expect.any(Number),
      })
    );
    expect(pdfBuffer.slice(0, 4).toString('utf8')).toBe('%PDF');
    expect(docx).toEqual(
      expect.objectContaining({
        format: 'docx',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: expect.stringMatching(/\.docx$/),
        storage_key: expect.stringContaining('/'),
        byte_size: expect.any(Number),
      })
    );
    expect(docxBuffer.slice(0, 2).toString('utf8')).toBe('PK');
  });
});
