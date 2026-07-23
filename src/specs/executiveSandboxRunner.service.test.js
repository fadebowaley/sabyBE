const mockExecutiveSandboxExecution = {
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
};
const mockAxios = {
  post: jest.fn(),
};

jest.mock('../models/executiveSandboxExecution.model', () => mockExecutiveSandboxExecution);
jest.mock('axios', () => mockAxios);

const sandboxRunner = require('../services/executiveSandboxRunner.service');

describe('executiveSandboxRunner.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXECUTIVE_INTELLIGENCE_ENABLE_SANDBOX;
    delete process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_PROVIDER;
    delete process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_URL;
    delete process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_TOKEN;
    mockExecutiveSandboxExecution.create.mockImplementation(async (payload) => payload);
    mockExecutiveSandboxExecution.findOneAndUpdate.mockImplementation(async (_query, update) => ({
      ...mockExecutiveSandboxExecution.create.mock.calls[0][0],
      ...update.$set,
    }));
  });

  test('reports sandbox execution as disabled by default', () => {
    const capabilities = sandboxRunner.getSandboxCapabilities();

    expect(capabilities).toEqual(
      expect.objectContaining({
        enabled: false,
        provider: 'disabled',
        networkAccess: false,
        productionCredentialsMounted: false,
        hostFilesystemMounted: false,
        dockerSocketMounted: false,
      })
    );
  });

  test('valid safe Python is persisted but blocked while sandbox provider is disabled', async () => {
    const result = await sandboxRunner.requestSandboxExecution({
      tenantId: 'tenant-1',
      userId: 'user-1',
      requestId: 'req-1',
      artifactVersion: 4,
      runtime: 'python',
      code: 'result = dataset.describe()',
      inputManifest: {
        datasetId: 'dataset-1',
        rows: 100,
        format: 'json',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        runtime: 'python',
        sandboxProvider: 'disabled',
        errorCategory: 'SANDBOX_DISABLED',
        codeBytes: Buffer.byteLength('result = dataset.describe()', 'utf8'),
      })
    );
    expect(result.validationResult.ok).toBe(true);
    expect(result.codeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(mockExecutiveSandboxExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        requestId: 'req-1',
        codeFingerprint: result.codeFingerprint,
        metadata: expect.objectContaining({
          rawCodeStored: false,
          rawDatasetStored: false,
        }),
      })
    );
    expect(JSON.stringify(mockExecutiveSandboxExecution.create.mock.calls[0][0])).not.toContain('dataset.describe()');
  });

  test('unsafe Python is blocked by validation before sandbox execution', async () => {
    const result = await sandboxRunner.requestSandboxExecution({
      tenantId: 'tenant-1',
      runtime: 'python',
      code: 'import os\nos.system("cat /etc/passwd")',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        errorCategory: 'CODE_IMPORT_OS',
      })
    );
    expect(result.validationResult.ok).toBe(false);
  });

  test('unsupported runtimes fail closed', async () => {
    const result = await sandboxRunner.requestSandboxExecution({
      tenantId: 'tenant-1',
      runtime: 'javascript',
      code: 'console.log("unsafe")',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        errorCategory: 'SANDBOX_RUNTIME_NOT_ALLOWED',
      })
    );
  });

  test('fingerprints equivalent code consistently', () => {
    expect(sandboxRunner.fingerprintCode('print(1)\r\n')).toBe(sandboxRunner.fingerprintCode('print(1)\n'));
  });

  test('runs validated Python through external HTTP provider when explicitly enabled', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_ENABLE_SANDBOX = 'true';
    process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_PROVIDER = 'external_http';
    process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_URL = 'http://sandbox-worker:8088/v1/run';
    process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_TOKEN = 'test-token';
    mockAxios.post.mockResolvedValue({
      data: {
        status: 'completed',
        runtime: 'python',
        durationMs: 12,
        outputManifest: {
          result: { total: 42 },
          stdout: '',
          destroyed: true,
        },
      },
    });

    const result = await sandboxRunner.requestSandboxExecution({
      tenantId: 'tenant-1',
      userId: 'user-1',
      requestId: 'req-1',
      runtime: 'python',
      code: 'result = {\"total\": sum(dataset[\"values\"])}',
      inputPayload: { values: [10, 32] },
      inputManifest: { rows: 2, format: 'json' },
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://sandbox-worker:8088/v1/run',
      expect.objectContaining({
        runtime: 'python',
        code: 'result = {"total": sum(dataset["values"])}',
        inputPayload: { values: [10, 32] },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        sandboxProvider: 'external_http',
        outputManifest: expect.objectContaining({
          result: { total: 42 },
          destroyed: true,
        }),
      })
    );
    expect(mockExecutiveSandboxExecution.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxExecutionId: result.sandboxExecutionId }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'running' }) }),
      { new: true }
    );
    expect(mockExecutiveSandboxExecution.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxExecutionId: result.sandboxExecutionId }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'completed' }) }),
      { new: true }
    );
  });

  test('external provider rejects imports under restricted runtime policy', async () => {
    process.env.EXECUTIVE_INTELLIGENCE_ENABLE_SANDBOX = 'true';
    process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_PROVIDER = 'external_http';
    process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_URL = 'http://sandbox-worker:8088/v1/run';

    const result = await sandboxRunner.requestSandboxExecution({
      tenantId: 'tenant-1',
      runtime: 'python',
      code: 'import pandas as pd\nresult = 1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'blocked',
        sandboxProvider: 'external_http',
        errorCategory: 'CODE_IMPORT_NOT_ALLOWED',
      })
    );
    expect(mockAxios.post).not.toHaveBeenCalled();
  });
});
