const crypto = require('crypto');

const mockPaymentService = {
  getPaymentByReference: jest.fn(),
  processPayment: jest.fn(),
  completePayment: jest.fn(),
  cancelPayment: jest.fn(),
  refundPayment: jest.fn(),
  updatePaymentById: jest.fn(),
};

const mockPaymentWebhookEventModel = {
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

jest.mock('../config/config', () => ({
  payment: {
    webhookSecret: 'test-webhook-secret',
    webhookToleranceSec: 300,
  },
}));

jest.mock('../models', () => ({
  PaymentWebhookEvent: mockPaymentWebhookEventModel,
}));

jest.mock('../services/payment.service', () => mockPaymentService);

const paymentWebhookService = require('../services/paymentWebhook.service');

const buildRequest = ({ rawBody, body, headers }) => ({
  body,
  rawBody,
  get: (name) => headers[name.toLowerCase()] || headers[name] || undefined,
});

const signPayload = ({ timestamp, rawBody, secret = 'test-webhook-secret' }) =>
  crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

describe('paymentWebhook.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes valid completed webhook and updates payment', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const body = {
      eventId: 'evt-1',
      reference: 'pay-ref-1',
      status: 'completed',
      providerRef: 'provider-ref-1',
      provider: 'testpay',
    };
    const rawBody = JSON.stringify(body);
    const signature = signPayload({ timestamp: nowSec, rawBody });

    const payment = {
      _id: '507f191e810c19729de860ea',
      tenantId: 'tenant-1',
      reference: 'pay-ref-1',
      total: 100,
      metadata: {},
      save: jest.fn().mockResolvedValue(true),
    };

    mockPaymentWebhookEventModel.create.mockResolvedValue({ _id: 'wh-1' });
    mockPaymentWebhookEventModel.findByIdAndUpdate.mockResolvedValue(true);
    mockPaymentService.getPaymentByReference.mockResolvedValue(payment);
    mockPaymentService.completePayment.mockResolvedValue(payment);

    const req = buildRequest({
      body,
      rawBody,
      headers: {
        'x-payment-timestamp': String(nowSec),
        'x-payment-signature': signature,
        'x-payment-provider': 'testpay',
        'x-event-id': 'evt-1',
      },
    });

    const result = await paymentWebhookService.processWebhookEvent(req);

    expect(result).toMatchObject({
      duplicate: false,
      processed: true,
      ignored: false,
      paymentReference: 'pay-ref-1',
      status: 'completed',
    });
    expect(mockPaymentService.completePayment).toHaveBeenCalledTimes(1);
    expect(mockPaymentWebhookEventModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'wh-1',
      expect.objectContaining({ webhookStatus: 'processed' }),
      { new: false }
    );
  });

  test('returns duplicate when replay key already exists', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const body = { reference: 'pay-ref-1', status: 'completed' };
    const rawBody = JSON.stringify(body);
    const signature = signPayload({ timestamp: nowSec, rawBody });

    const duplicateError = new Error('duplicate');
    duplicateError.code = 11000;
    mockPaymentWebhookEventModel.create.mockRejectedValue(duplicateError);

    const req = buildRequest({
      body,
      rawBody,
      headers: {
        'x-payment-timestamp': String(nowSec),
        'x-payment-signature': signature,
      },
    });

    const result = await paymentWebhookService.processWebhookEvent(req);

    expect(result).toEqual({ duplicate: true, processed: false });
    expect(mockPaymentService.getPaymentByReference).not.toHaveBeenCalled();
  });
});
