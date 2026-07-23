const mockPublicFormAccess = {};
const mockProjectFormService = {
  normalizeProjectFormRuntimeConfig: jest.fn((value) => value),
};
const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../models', () => ({
  PublicFormAccess: mockPublicFormAccess,
}));
jest.mock('../services/projectForm.service', () => mockProjectFormService);
jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const service = require('../services/publicSubmissionValidation.service');

describe('publicSubmissionValidation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostgresPool.query.mockResolvedValue({ rows: [] });
  });

  test('rejects standard public submission when form requires secure access', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
            },
          },
        },
        submissionData: { email: 'ada@example.com' },
        routeType: 'public_standard',
      })
    ).rejects.toMatchObject({
      message: 'This form requires a verified secure access session before submission.',
    });
  });

  test('rejects duplicate public submission when protected field already exists', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'off',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
                submissionProtection: {
                  preventDuplicateSubmission: true,
                  duplicateCheckField: 'email',
                },
              },
            },
          },
        },
        submissionData: { email: 'ada@example.com' },
        routeType: 'public_standard',
      })
    ).rejects.toMatchObject({
      message: 'A submission with the same protected field value already exists.',
    });
  });

  test('rejects rate-limited submissions after max submissions within the active window', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ count: 3 }] });

    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'off',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
                submissionProtection: {
                  rateLimitEnabled: true,
                  maxSubmissionsPerUser: 3,
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        routeType: 'public_standard',
        actorContext: {
          ip: '127.0.0.1',
        },
      })
    ).rejects.toMatchObject({
      message: 'Submission rate limit reached for this form. Please try again later.',
    });
  });

  test('rejects repeated submissions when multiple submissions are disabled', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'off',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              behavior: {
                allowMultipleSubmissions: false,
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        routeType: 'public_standard',
        actorContext: {
          ip: '127.0.0.1',
        },
      })
    ).rejects.toMatchObject({
      message: 'Multiple submissions are disabled for this form.',
    });
  });

  test('rejects secure compliance submissions when the reporting-period limit is reached', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                reportingPeriod: {
                  scope: 'monthly',
                },
                submissionPolicy: {
                  maxSubmissionsPerPeriod: 1,
                },
                submissionFrequency: {
                  mode: 'once',
                  count: 1,
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'monthly',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            month: '2099-06',
            reportingContext: {
              scope: 'monthly',
              selectedDate: '2099-06-15',
              selectedMonth: '2099-06',
              selectedYear: 2099,
              periodKey: '2099-06',
            },
          },
        },
        routeType: 'public_secure',
        actorContext: {
          userId: 'user-1',
          identifier: 'ada@example.com',
          ip: '127.0.0.1',
        },
      })
    ).rejects.toMatchObject({
      message: 'Submission limit reached for this reporting period.',
    });
  });

  test('rejects compliance submission limits on open public forms without OTP authentication', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'off',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                reportingPeriod: {
                  scope: 'monthly',
                },
                submissionPolicy: {
                  maxSubmissionsPerPeriod: 1,
                },
                submissionFrequency: {
                  mode: 'once',
                  count: 1,
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'monthly',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            month: '2099-06',
            reportingContext: {
              scope: 'monthly',
              selectedDate: '2099-06-15',
              selectedMonth: '2099-06',
              selectedYear: 2099,
              periodKey: '2099-06',
            },
          },
        },
        routeType: 'public_standard',
        actorContext: {
          ip: '127.0.0.1',
        },
      })
    ).rejects.toMatchObject({
      message: 'Compliance submission limits require OTP-authenticated public access.',
    });
  });

  test('accepts yearly compliance submissions when the selected reporting date falls inside the configured year', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                reportingPeriod: {
                  scope: 'yearly',
                  defaultYear: 2099,
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'yearly',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            month: '2099-06',
            year: 2099,
            reportingContext: {
              scope: 'yearly',
              selectedDate: '2099-06-15',
              selectedMonth: '2099-06',
              selectedYear: 2099,
              periodKey: '2099',
            },
          },
        },
        routeType: 'public_secure',
        actorContext: {
          userId: 'user-1',
          identifier: 'ada@example.com',
          ip: '127.0.0.1',
        },
      })
    ).resolves.toMatchObject({
      submissionMode: 'public_secure',
      routeType: 'public_secure',
    });
  });

  test('rejects monthly compliance submissions when the selected reporting date falls outside the configured month', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'off',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                reportingPeriod: {
                  scope: 'monthly',
                  defaultMonth: '2099-06',
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'monthly',
            eventDate: '2099-07-01',
            submissionDate: '2099-07-01',
            month: '2099-07',
            year: 2099,
            reportingContext: {
              scope: 'monthly',
              selectedDate: '2099-07-01',
              selectedMonth: '2099-07',
              selectedYear: 2099,
              periodKey: '2099-06',
            },
          },
        },
        routeType: 'public_standard',
        actorContext: {
          ip: '127.0.0.1',
        },
      })
    ).rejects.toMatchObject({
      message: 'Reporting date must fall inside 2099-06.',
    });
  });

  test('accepts weekly compliance submissions when a reporting date is supplied inside the allowed window', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                availability: {
                  startDate: '2099-06-14',
                  endDate: '2099-06-20',
                },
                reportingPeriod: {
                  scope: 'weekly',
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'weekly',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            month: '2099-06',
            year: 2099,
            reportingContext: {
              scope: 'weekly',
              selectedDate: '2099-06-15',
              selectedWeek: '2099-W25',
              periodKey: '2099-W25',
            },
          },
        },
        routeType: 'public_secure',
        actorContext: {
          userId: 'user-1',
          identifier: 'ada@example.com',
          ip: '127.0.0.1',
        },
      })
    ).resolves.toMatchObject({
      submissionMode: 'public_secure',
      routeType: 'public_secure',
    });
  });

  test('accepts date-range compliance submissions when a reporting date is supplied inside the configured range', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                availability: {
                  startDate: '2099-06-10',
                  endDate: '2099-06-20',
                },
                reportingPeriod: {
                  scope: 'custom_range',
                  customRange: {
                    maxDays: 11,
                  },
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'custom_range',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            month: '2099-06',
            year: 2099,
            reportingContext: {
              scope: 'custom_range',
              selectedDate: '2099-06-15',
              selectedMonth: '2099-06',
              selectedYear: 2099,
              selectedRangeStart: '2099-06-10',
              selectedRangeEnd: '2099-06-20',
              periodKey: '2099-06-10:2099-06-20',
            },
          },
        },
        routeType: 'public_secure',
        actorContext: {
          userId: 'user-1',
          identifier: 'ada@example.com',
          ip: '127.0.0.1',
        },
      })
    ).resolves.toMatchObject({
      submissionMode: 'public_secure',
      routeType: 'public_secure',
    });
  });

  test('ignores hidden legacy compliance scheduling fields during public submission', async () => {
    await expect(
      service.runPublicPreSubmitPipeline({
        projectForm: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          formId: 'form-1',
          capabilities: {
            experience: {
              security: {
                publicSecureMode: 'otp',
                access: {
                  restrictByLocation: false,
                },
                channels: ['web'],
              },
              compliance: {
                enabled: true,
                reportingPeriod: {
                  scope: 'daily',
                  timezone: 'Africa/Lagos',
                  weekStartsOn: 0,
                },
                submissionPolicy: {
                  closeWindowAtPeriodEnd: true,
                },
                submissionFrequency: {
                  mode: 'daily',
                  count: 1,
                },
              },
            },
          },
        },
        submissionData: { field_1: 'value' },
        metadata: {
          compliance: {
            reportingScope: 'daily',
            eventDate: '2099-06-15',
            submissionDate: '2099-06-15',
            reportingContext: {
              scope: 'daily',
              selectedDate: '2099-06-15',
              periodKey: '2099-06-15',
            },
          },
        },
        routeType: 'public_secure',
        actorContext: {
          userId: 'user-1',
          identifier: 'ada@example.com',
          ip: '127.0.0.1',
        },
      })
    ).resolves.toMatchObject({
      submissionMode: 'public_secure',
      routeType: 'public_secure',
    });
  });
});
