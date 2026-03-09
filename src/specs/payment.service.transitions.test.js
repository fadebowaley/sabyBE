const httpStatus = require('http-status');

const mockPaymentModel = {
  create: jest.fn(),
  findOne: jest.fn(),
};

const mockPaymentRemittanceService = {
  enqueueIfEligible: jest.fn(),
};

const mockPaymentEventService = {
  appendPaymentEvent: jest.fn(),
};

jest.mock('../models', () => ({
  Payment: mockPaymentModel,
}));

jest.mock('../services/paymentRemittance.service', () => mockPaymentRemittanceService);
jest.mock('../services/paymentEvent.service', () => mockPaymentEventService);

const paymentService = require('../services/payment.service');

describe('payment.service transition guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentEventService.appendPaymentEvent.mockResolvedValue(true);
    mockPaymentRemittanceService.enqueueIfEligible.mockResolvedValue({ queued: false });
  });

  test('rejects invalid transition: completed -> processing', async () => {
    mockPaymentModel.findOne.mockResolvedValue({
      _id: 'p-1',
      id: 'p-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      status: 'completed',
      save: jest.fn(),
    });

    await expect(
      paymentService.processPayment('p-1', {}, 'tenant-1')
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('Invalid payment status transition'),
    });
  });

  test('completes payment from processing and enqueues remittance path', async () => {
    const payment = {
      _id: 'p-2',
      id: 'p-2',
      tenantId: 'tenant-1',
      userId: 'user-1',
      reference: 'ref-2',
      status: 'processing',
      purpose: 'collection',
      beneficiaryType: 'tenant',
      remittanceConfigId: 'remit-1',
      paymentDetails: {},
      completionDetails: {},
      metadata: {},
      save: jest.fn().mockResolvedValue(true),
    };

    mockPaymentModel.findOne.mockResolvedValue(payment);
    mockPaymentRemittanceService.enqueueIfEligible.mockResolvedValue({
      queued: true,
      jobId: 'job-1',
    });

    const result = await paymentService.completePayment('p-2', {}, 'tenant-1');

    expect(result.status).toBe('completed');
    expect(payment.save).toHaveBeenCalled();
    expect(mockPaymentEventService.appendPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'completed',
        fromStatus: 'processing',
        toStatus: 'completed',
      })
    );
    expect(mockPaymentRemittanceService.enqueueIfEligible).toHaveBeenCalledTimes(1);
  });
});
