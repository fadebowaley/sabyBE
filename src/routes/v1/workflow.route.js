/**
 * Workflow routes
 *
 * Mounted at /v1/workflows  (inbox) and
 * also extended via unifiedSubmission.route.js for per-submission endpoints.
 */
const express = require('express');
const auth = require('../../middlewares/auth');
const workflowController = require('../../controllers/workflow.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Workflows
 *   description: Approval and review workflows for module submissions
 */

// ── Approval inbox — steps waiting for the caller's role ──────────────────
router.get('/inbox', auth(), workflowController.getInbox);

module.exports = router;
