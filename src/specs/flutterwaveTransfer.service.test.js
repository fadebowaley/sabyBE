jest.mock('../config/config', () => ({
  payment: {
    providers: {
      flutterwave: { secretKey: 'test-key' },
    },
  },
}));
jest.mock('../models/flutterwaveTransferLog.model', () => ({}));
jest.mock('../config/logger', () => ({ error: jest.fn() }));
jest.mock('../models', () => ({ Payment: {} }));
jest.mock('../queues/paymentRemittance.queue', () => ({
  queueRemittance: jest.fn(),
  PAYMENT_REMITTANCE_QUEUE_NAME: 'paymentRemittanceQueue',
}));
jest.mock('../services/paymentEvent.service', () => ({}));
jest.mock('../services/paymentSettlement.service', () => ({}));
jest.mock('../services/paymentFlow.service', () => ({
  upsertPaymentFlow: jest.fn(),
  fromSettlement: jest.fn(),
}));
jest.mock('../services/settlementProvider.service', () => ({}));
jest.mock('../services/dlq.service', () => ({}));

const { assertTransferReady } = require('../services/flutterwaveTransfer.service');
const { requiresPayoutAggregation } = require('../services/paymentRemittance.service');

describe('flutterwaveTransfer.service transfer minimums', () => {
  test('blocks an NGN payout below Flutterwave minimum before a transfer request', () => {
    expect.assertions(3);

    try {
      assertTransferReady({
        settlement: {
          currency: 'NGN',
          netAmount: 57.4,
          destinationAccount: {
            accountNumber: '8145045108',
            bankCode: '100004',
          },
        },
      });
    } catch (error) {
      expect(error.code).toBe('FLUTTERWAVE_TRANSFER_MINIMUM_NOT_MET');
      expect(error.minimumAmount).toBe(100);
      expect(error.transferAmount).toBe(57.4);
    }
  });

  test('recognizes the stored Flutterwave minimum-limit error as an aggregation requirement', () => {
    expect(
      requiresPayoutAggregation({
        failureReason: 'Amount is below minimum limit of 100',
      })
    ).toBe(true);
  });
});