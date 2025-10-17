const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const inmailValidation = require('../../validations/inmail.validation');
const inmailController = require('../../controllers/inmail.controller');

const router = express.Router();

// Message routes
router
  .route('/')
  .post(auth('create:inmail'), validate(inmailValidation.createMessage), inmailController.createMessage)
  .get(auth('view:inmail'), validate(inmailValidation.queryMessages), inmailController.queryMessages);

// Send and draft routes (must be before /:inmailId to avoid route conflicts)
router.route('/send').post(auth('create:inmail'), validate(inmailValidation.sendMessage), inmailController.sendMessage);

router.route('/draft').post(auth('create:inmail'), validate(inmailValidation.saveDraft), inmailController.saveDraft);

// Inbox count route
router.route('/count').get(auth('view:inmail'), inmailController.getInboxCount);

// Mark as read route
router.route('/:inmailId/read').patch(auth('update:inmail'), inmailController.markAsRead);

// Individual message routes
router
  .route('/:inmailId')
  .get(auth('view:inmail'), validate(inmailValidation.getMessageById), inmailController.getMessageById)
  .patch(auth('update:inmail'), validate(inmailValidation.updateMessage), inmailController.updateMessage)
  .delete(auth('delete:inmail'), validate(inmailValidation.getMessageById), inmailController.deleteMessage);

module.exports = router;
