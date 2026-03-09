const request = require('supertest');

const mockPaymentWebhookService = {
  processWebhookEvent: jest.fn(),
};

const mockCopilotActionService = {
  recordExistingAction: jest.fn().mockResolvedValue(true),
};

jest.mock('../services/paymentWebhook.service', () => mockPaymentWebhookService);
jest.mock('../services/copilotAction.service', () => mockCopilotActionService);

const app = require('../app');

describe('POST /v1/payment/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts webhook, forwards to service, and preserves rawBody for signature verification', async () => {
    const payload = {
      eventId: 'evt-route-1',
      reference: 'pay-route-1',
      status: 'completed',
      provider: 'testpay',
      data: { amount: 5000 },
    };

    mockPaymentWebhookService.processWebhookEvent.mockImplementation(async (req) => {
      expect(req.rawBody).toBe(JSON.stringify(payload));
      return {
        duplicate: false,
        processed: true,
        ignored: false,
        status: 'completed',
        paymentId: 'payment-1',
        paymentReference: 'pay-route-1',
      };
    });

    const res = await request(app)
      .post('/v1/payment/webhook')
      .set('Content-Type', 'application/json')
      .set('x-payment-provider', 'testpay')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      duplicate: false,
      processed: true,
      ignored: false,
    });

    expect(mockPaymentWebhookService.processWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mockCopilotActionService.recordExistingAction).toHaveBeenCalledTimes(1);
  });

  test('handles duplicate webhook response idempotently', async () => {
    mockPaymentWebhookService.processWebhookEvent.mockResolvedValue({
      duplicate: true,
      processed: false,
      ignored: false,
    });

    const res = await request(app)
      .post('/v1/payment/webhook')
      .set('Content-Type', 'application/json')
      .send({ eventId: 'evt-dup-1', reference: 'ref-dup-1', status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      duplicate: true,
      processed: false,
      ignored: false,
    });
    expect(mockCopilotActionService.recordExistingAction).not.toHaveBeenCalled();
  });
});
