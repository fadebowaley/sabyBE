const request = require('supertest');

const mockQueueStub = {
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getDelayedCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
};

const mockPostgresPool = {
  query: jest.fn(async (sql) => {
    if (sql.includes('SELECT 1')) {
      return { rows: [{ ok: 1 }] };
    }
    if (sql.includes("to_regclass('copilot.entity_resolution_logs')")) {
      return { rows: [{ table_name: 'copilot.entity_resolution_logs' }] };
    }
    if (sql.includes('FROM pg_class')) {
      return {
        rows: [
          { relname: 'form_submissions', estimated_rows: 100 },
          { relname: 'submission_activity_log', estimated_rows: 200 },
          { relname: 'dead_letter_queue', estimated_rows: 3 },
        ],
      };
    }
    if (sql.includes('WITH outbox AS')) {
      return {
        rows: [
          {
            outbox_lag_seconds: 90,
            outbox_pending: 12,
            dlq_total: 8,
            dlq_last_24h: 2,
            action_latency_avg_minutes: 3.5,
            action_latency_p95_minutes: 9.2,
            deliveries_total_24h: 40,
            deliveries_success_24h: 30,
            resolutions_total_24h: 20,
            resolutions_resolved_24h: 14,
            resolutions_ambiguous_24h: 4,
            resolutions_not_found_24h: 2,
            resolutions_p95_latency_ms: 120,
          },
        ],
      };
    }
    return { rows: [] };
  }),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
  testConnection: jest.fn().mockResolvedValue(true),
}));

jest.mock('../middlewares/queues', () => ({
  submissionQueue: mockQueueStub,
}));

jest.mock('../services/notificationQueue.service', () => ({
  queue: mockQueueStub,
}));

jest.mock('../queues/baseline.queue', () => ({
  nodeBaselineQueue: mockQueueStub,
  networkBaselineQueue: mockQueueStub,
  batchChangeQueue: mockQueueStub,
}));

jest.mock('../queues/paymentRemittance.queue', () => ({
  paymentRemittanceQueue: mockQueueStub,
}));

jest.mock('../queues/paymentReconciliation.queue', () => ({
  paymentReconciliationQueue: mockQueueStub,
}));

jest.mock('../config/redis', () => ({
  testRedisConnection: jest.fn().mockResolvedValue(true),
  getRedisConnectionOptions: jest.fn(() => ({})),
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueueStub),
}));

const app = require('../app');

describe('GET /api/status/summary copilot operational metrics', () => {
  test('includes outbox lag, DLQ growth, action latency, and notification delivery success rate', async () => {
    const res = await request(app).get('/api/status/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('metrics.copilotOperational');
    expect(res.body.metrics.copilotOperational).toEqual(
      expect.objectContaining({
        status: 'connected',
        outboxLagSeconds: 90,
        outboxPending: 12,
        dlqTotal: 8,
        dlqLast24h: 2,
        actionLatencyAvgMinutes: 3.5,
        actionLatencyP95Minutes: 9.2,
        notificationDeliverySuccessRate24h: 75,
        entityResolutionTotal24h: 20,
        entityResolutionResolved24h: 14,
        entityResolutionAmbiguous24h: 4,
        entityResolutionNotFound24h: 2,
        entityResolutionAutoResolveRate24h: 70,
        entityResolutionP95LatencyMs: 120,
      })
    );
  });
});
