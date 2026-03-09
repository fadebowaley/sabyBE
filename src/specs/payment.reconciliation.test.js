const mockPaymentModel = {
  find: jest.fn(),
};

const mockPaymentEventService = {
  appendPaymentEvent: jest.fn(),
};

const mockPaymentRemittanceService = {
  enqueueIfEligible: jest.fn(),
};

jest.mock('../models', () => ({
  Payment: mockPaymentModel,
}));

jest.mock('../services/paymentEvent.service', () => mockPaymentEventService);
jest.mock('../services/paymentRemittance.service', () => mockPaymentRemittanceService);

const paymentReconciliationService = require('../services/paymentReconciliation.service');

const buildQueryChain = (rows) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(rows),
});

describe('payment.reconciliation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentEventService.appendPaymentEvent.mockResolvedValue(true);
  });

  test('marks stuck processing payments as failed and queues remittance for eligible completions', async () => {
    const stuckPayment = {
      _id: 'p-stuck-1',
      id: 'p-stuck-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      reference: 'ref-stuck-1',
      status: 'processing',
      metadata: {},
      save: jest.fn().mockResolvedValue(true),
    };

    const completedEligible = {
      _id: 'p-completed-1',
      id: 'p-completed-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      reference: 'ref-completed-1',
      status: 'completed',
      purpose: 'collection',
      beneficiaryType: 'tenant',
      remittanceConfigId: 'rc-1',
    };

    mockPaymentModel.find
      .mockReturnValueOnce(buildQueryChain([stuckPayment]))
      .mockReturnValueOnce(buildQueryChain([completedEligible]));

    mockPaymentRemittanceService.enqueueIfEligible.mockResolvedValue({
      queued: true,
      jobId: 'remit-job-1',
    });

    const result = await paymentReconciliationService.runReconciliationSweep();

    expect(stuckPayment.status).toBe('failed');
    expect(stuckPayment.save).toHaveBeenCalledTimes(1);
    expect(mockPaymentEventService.appendPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'reconciliation_marked_failed',
        fromStatus: 'processing',
        toStatus: 'failed',
      })
    );
    expect(mockPaymentRemittanceService.enqueueIfEligible).toHaveBeenCalledWith(
      completedEligible,
      expect.objectContaining({ trigger: 'payment.reconciliation.sweep' })
    );
    expect(result).toEqual(
      expect.objectContaining({
        failedCount: 1,
        remittanceQueued: 1,
        scannedStuck: 1,
      })
    );
  });
});
