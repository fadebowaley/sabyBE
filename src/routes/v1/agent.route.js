const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const agentGatewayValidation = require('../../validations/agentGateway.validation');
const agentGatewayController = require('../../controllers/agentGateway.controller');

/**
 * Phase 5 — Agent gateway between the frontend and the governed Saby engine.
 * JWT identity comes from the standard auth() middleware; quota/BYOK parity,
 * usage metering, SSE translation and durable threads live behind these routes.
 */
const router = express.Router();

router.post(
  '/chat',
  auth(),
  validate(agentGatewayValidation.chat),
  agentGatewayController.chat
);

// Stream alias for frontend copilot proxy compatibility
router.post(
  '/stream',
  auth(),
  validate(agentGatewayValidation.chat),
  agentGatewayController.chat
);

const historyThreadsRouter = express.Router();
historyThreadsRouter.get(
  '/',
  auth(),
  validate(agentGatewayValidation.listThreads),
  agentGatewayController.listThreads
);
historyThreadsRouter.post(
  '/',
  auth(),
  validate(agentGatewayValidation.createThread),
  agentGatewayController.createThread
);
historyThreadsRouter.get(
  '/:threadId',
  auth(),
  validate(agentGatewayValidation.getThread),
  agentGatewayController.getThread
);
historyThreadsRouter.delete(
  '/:threadId',
  auth(),
  validate(agentGatewayValidation.getThread),
  agentGatewayController.deleteThread
);

router.use('/history/threads', historyThreadsRouter);
router.historyThreadsRouter = historyThreadsRouter;

router.get('/tokens/balance', auth(), agentGatewayController.getBalance);
router.post(
  '/tokens/credit',
  auth(),
  agentGatewayController.creditTokens
);

router.get(
  '/usage',
  auth(),
  validate(agentGatewayValidation.listUsage),
  agentGatewayController.getUsage
);

router.get(
  '/tokens/logs',
  auth(),
  validate(agentGatewayValidation.listUsage),
  agentGatewayController.getTokenLogs
);

module.exports = router;