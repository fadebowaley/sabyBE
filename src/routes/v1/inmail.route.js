const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const inmailValidation = require('../../validations/inmail.validation');
const inmailController = require('../../controllers/inmail.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('create:inmail'), validate(inmailValidation.createMessage), inmailController.createMessage)
  .get(auth('view:inmail'), validate(inmailValidation.queryMessages), inmailController.queryMessages);

router
  .route('/:inmailId')
  .get(auth('view:inmail'), validate(inmailValidation.getMessageById), inmailController.getMessageById)
  .patch(auth('update:inmail'), validate(inmailValidation.updateMessage), inmailController.updateMessage)
  .delete(auth('delete:inmail'), validate(inmailValidation.getMessageById), inmailController.deleteMessage);

router.route('/send').post(auth('create:inmail'), validate(inmailValidation.sendMessage), inmailController.sendMessage);

router.route('/draft').post(auth('create:inmail'), validate(inmailValidation.saveDraft), inmailController.saveDraft);

module.exports = router;
