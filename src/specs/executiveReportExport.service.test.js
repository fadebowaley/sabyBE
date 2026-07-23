const mockExecutiveIntelligenceReportExport = {
  create: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
};
const mockProvider = {
  upload: jest.fn(),
  generatePresignedUrl: jest.fn(),
};
const mockStorageProviderFactory = {
  create: jest.fn(() => mockProvider),
};

jest.mock('../models/executiveIntelligenceReportExport.model', () => mockExecutiveIntelligenceReportExport);
jest.mock('../services/providers/storageProvider', () => ({
  StorageProviderFactory: mockStorageProviderFactory,
}));

const executiveReportExportService = require('../services/executiveReportExport.service');

describe('executiveReportExport.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STORAGE_PROVIDER = 'aws-s3';
  });

  test('persists CSV and XLSX render artifacts and returns download descriptors without raw content', async () => {
    mockProvider.upload
      .mockResolvedValueOnce({ provider: 'aws-s3', key: 'safe/report.csv', url: 'https://storage.test/report.csv' })
      .mockResolvedValueOnce({ provider: 'aws-s3', key: 'safe/report.xlsx', url: 'https://storage.test/report.xlsx' })
      .mockResolvedValueOnce({ provider: 'aws-s3', key: 'safe/report.html', url: 'https://storage.test/report.html' })
      .mockResolvedValueOnce({ provider: 'aws-s3', key: 'safe/report.pdf', url: 'https://storage.test/report.pdf' })
      .mockResolvedValueOnce({ provider: 'aws-s3', key: 'safe/report.docx', url: 'https://storage.test/report.docx' });
    mockExecutiveIntelligenceReportExport.create
      .mockImplementationOnce(async (payload) => ({
        exportId: 'ei_export_csv_123',
        ...payload,
      }))
      .mockImplementationOnce(async (payload) => ({
        exportId: 'ei_export_xlsx_123',
        ...payload,
      }))
      .mockImplementationOnce(async (payload) => ({
        exportId: 'ei_export_html_123',
        ...payload,
      }))
      .mockImplementationOnce(async (payload) => ({
        exportId: 'ei_export_pdf_123',
        ...payload,
      }))
      .mockImplementationOnce(async (payload) => ({
        exportId: 'ei_export_docx_123',
        ...payload,
      }));

    const result = await executiveReportExportService.persistRenderedReportExports({
      tenantId: 'tenant-1',
      userId: 'user-1',
      requestId: 'req-1',
      reportModel: {
        report_id: 'report-1',
        title: 'Sales report',
        kind: 'report',
        audit: { artifact_version: 4, report_artifact_version: 'phase_8_canonical_report_v1' },
      },
      renderedReport: {
        csv: {
          format: 'csv',
          filename: 'sales.csv',
          content_type: 'text/csv; charset=utf-8',
          content: 'A,B\n1,2\n',
          storage_key: 'safe/report.csv',
        },
        xlsx: {
          format: 'xlsx',
          filename: 'sales.xlsx',
          content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content_base64: Buffer.from('xlsx-bytes').toString('base64'),
          storage_key: 'safe/report.xlsx',
        },
        html: {
          format: 'html',
          filename: 'sales.html',
          content_type: 'text/html; charset=utf-8',
          content: '<!doctype html><html><body>safe</body></html>',
          storage_key: 'safe/report.html',
        },
        pdf: {
          format: 'pdf',
          filename: 'sales.pdf',
          content_type: 'application/pdf',
          content_base64: Buffer.from('%PDF bytes').toString('base64'),
          storage_key: 'safe/report.pdf',
        },
        docx: {
          format: 'docx',
          filename: 'sales.docx',
          content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content_base64: Buffer.from('PK docx bytes').toString('base64'),
          storage_key: 'safe/report.docx',
        },
      },
    });

    expect(mockProvider.upload).toHaveBeenCalledTimes(5);
    expect(mockExecutiveIntelligenceReportExport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        requestId: 'req-1',
        reportId: 'report-1',
        format: 'csv',
        storageKey: 'safe/report.csv',
      })
    );
    expect(result.csv).toEqual(
      expect.objectContaining({
        export_id: 'ei_export_csv_123',
        format: 'csv',
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_csv_123/download',
        persisted: true,
      })
    );
    expect(result.csv).not.toHaveProperty('content');
    expect(result.csv).not.toHaveProperty('storage_key');
    expect(result.xlsx).toEqual(
      expect.objectContaining({
        export_id: 'ei_export_xlsx_123',
        format: 'xlsx',
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_xlsx_123/download',
        persisted: true,
      })
    );
    expect(result.xlsx).not.toHaveProperty('content_base64');
    expect(result.xlsx).not.toHaveProperty('storage_key');
    expect(result.html).toEqual(
      expect.objectContaining({
        export_id: 'ei_export_html_123',
        format: 'html',
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_html_123/download',
        persisted: true,
      })
    );
    expect(result.html).not.toHaveProperty('content');
    expect(result.html).not.toHaveProperty('storage_key');
    expect(result.pdf).toEqual(
      expect.objectContaining({
        export_id: 'ei_export_pdf_123',
        format: 'pdf',
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_pdf_123/download',
        persisted: true,
      })
    );
    expect(result.pdf).not.toHaveProperty('content_base64');
    expect(result.pdf).not.toHaveProperty('storage_key');
    expect(result.docx).toEqual(
      expect.objectContaining({
        export_id: 'ei_export_docx_123',
        format: 'docx',
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_docx_123/download',
        persisted: true,
      })
    );
    expect(result.docx).not.toHaveProperty('content_base64');
    expect(result.docx).not.toHaveProperty('storage_key');
  });

  test('generates a short-lived download URL for the export creator', async () => {
    mockExecutiveIntelligenceReportExport.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        exportId: 'ei_export_csv_123',
        tenantId: 'tenant-1',
        userId: 'user-1',
        filename: 'sales.csv',
        contentType: 'text/csv; charset=utf-8',
        storageProvider: 'aws-s3',
        storageKey: 'safe/report.csv',
        status: 'active',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    mockProvider.generatePresignedUrl.mockResolvedValue('https://download.test/signed');

    const result = await executiveReportExportService.getExportDownload({
      tenantId: 'tenant-1',
      exportId: 'ei_export_csv_123',
      user: { _id: 'user-1', tenantId: 'tenant-1' },
    });

    expect(mockProvider.generatePresignedUrl).toHaveBeenCalledWith('safe/report.csv', 300);
    expect(result).toEqual({
      downloadUrl: 'https://download.test/signed',
      fileName: 'sales.csv',
      contentType: 'text/csv; charset=utf-8',
      expiresInSeconds: 300,
    });
  });
});
