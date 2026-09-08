const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const aiTokenValidation = require('../../validations/aiToken.validation');
const aiTokenController = require('../../controllers/aiToken.controller');

const router = express.Router();

router.get('/packs', aiTokenController.getPacks);

router.get('/balance', auth(), aiTokenController.getBalance);

router.post(
  '/checkout',
  auth(),
  validate(aiTokenValidation.initializeCheckout),
  aiTokenController.initializeCheckout
);

router.post(
  '/admin/allocate',
  auth(),
  validate(aiTokenValidation.allocateTokens),
  aiTokenController.allocateTokens
);

router.get(
  '/admin/quotas',
  auth(),
  validate(aiTokenValidation.listQuotas),
  aiTokenController.listQuotas
);

module.exports = router;
