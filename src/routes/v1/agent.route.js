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

router.get(
  '/history/threads',
  auth(),
  validate(agentGatewayValidation.listThreads),
  agentGatewayController.listThreads
);
router.post(
  '/history/threads',
  auth(),
  validate(agentGatewayValidation.createThread),
  agentGatewayController.createThread
);
router.get(
  '/history/threads/:threadId',
  auth(),
  validate(agentGatewayValidation.getThread),
  agentGatewayController.getThread
);
router.delete(
  '/history/threads/:threadId',
  auth(),
  validate(agentGatewayValidation.getThread),
  agentGatewayController.deleteThread
);

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

module.exports = router;