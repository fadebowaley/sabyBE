const express = require('express');
const auth = require('../../middlewares/auth');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const inmailValidation = require('../../validations/inmail.validation');
const inmailController = require('../../controllers/inmail.controller');

const router = express.Router();

// Message routes
// Test route: Using hybridAuth + requireAccess pattern for optimized API key handling
router
  .route('/')
  .post(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('inmail:create'), // Uses req.apiKey if set, skips duplicate verification
    validate(inmailValidation.createMessage),
    inmailController.createMessage
  )
  .get(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('inmail:read'), // Uses req.apiKey if set, skips duplicate verification
    validate(inmailValidation.queryMessages),
    inmailController.queryMessages
  );

// Send and draft routes (must be before /:inmailId to avoid route conflicts)
router
  .route('/send')
  .post(
    auth('inmail:create'),
    validate(inmailValidation.sendMessage),
    inmailController.sendMessage
  );

router
  .route('/draft')
  .post(
    auth('inmail:create'),
    validate(inmailValidation.saveDraft),
    inmailController.saveDraft
  );

// Inbox count route
router.route('/count').get(auth('inmail:read'), inmailController.getInboxCount);

// Mark as read route
router
  .route('/:inmailId/read')
  .patch(auth('inmail:update'), inmailController.markAsRead);

// Individual message routes
// Test route: Using hybridAuth + requireAccess pattern for optimized API key handling
router
  .route('/:inmailId')
  .get(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('inmail:read'), // Uses req.apiKey if set, skips duplicate verification
    validate(inmailValidation.getMessageById),
    inmailController.getMessageById
  )
  .patch(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('inmail:update'), // Uses req.apiKey if set, skips duplicate verification
    validate(inmailValidation.updateMessage),
    inmailController.updateMessage
  )
  .delete(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('inmail:delete'), // Uses req.apiKey if set, skips duplicate verification
    validate(inmailValidation.getMessageById),
    inmailController.deleteMessage
  );

module.exports = router;
