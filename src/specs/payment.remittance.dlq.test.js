const mockPaymentModel = {
  findById: jest.fn(),
};

const mockQueueModule = {
  queueRemittance: jest.fn(),
  PAYMENT_REMITTANCE_QUEUE_NAME: 'paymentRemittanceQueue',
};

const mockPaymentEventService = {
  appendPaymentEvent: jest.fn(),
};

const mockDLQService = {
  saveToDLQ: jest.fn(),
  sendAdminAlert: jest.fn(),
};

jest.mock('../models', () => ({
  Payment: mockPaymentModel,
}));

jest.mock('../queues/paymentRemittance.queue', () => mockQueueModule);
jest.mock('../services/paymentEvent.service', () => mockPaymentEventService);
jest.mock('../services/dlq.service', () => mockDLQService);

const paymentRemittanceService = require('../services/paymentRemittance.service');

describe('payment.remittance DLQ behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not save to DLQ when retries remain', async () => {
    const result = await paymentRemittanceService.handleRemittanceFailure(
      {
        id: 'job-1',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: { tenantId: 'tenant-1', paymentId: 'p-1' },
      },
      new Error('temporary remittance outage')
    );

    expect(result).toEqual({ dlqSaved: false, willRetry: true });
    expect(mockDLQService.saveToDLQ).not.toHaveBeenCalled();
    expect(mockDLQService.sendAdminAlert).not.toHaveBeenCalled();
  });

  test('saves to DLQ and sends alert when max retries are exhausted', async () => {
    mockDLQService.saveToDLQ.mockResolvedValue({ id: 'dlq-1' });
    mockDLQService.sendAdminAlert.mockResolvedValue('alert-1');

    const result = await paymentRemittanceService.handleRemittanceFailure(
      {
        id: 'job-2',
        attemptsMade: 5,
        opts: { attempts: 5 },
        data: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          paymentId: 'p-2',
          reference: 'ref-2',
        },
      },
      new Error('final remittance failure')
    );

    expect(result).toEqual({ dlqSaved: true, willRetry: false });
    expect(mockDLQService.saveToDLQ).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-2',
        queueName: 'paymentRemittanceQueue',
        attempts: 5,
        tenantId: 'tenant-1',
      })
    );
    expect(mockDLQService.sendAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment_remittance_permanent_failure',
        tenantId: 'tenant-1',
      })
    );
  });
});
