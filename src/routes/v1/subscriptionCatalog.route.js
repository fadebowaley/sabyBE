const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const subscriptionCatalogValidation = require('../../validations/subscriptionCatalog.validation');
const subscriptionCatalogController = require('../../controllers/subscriptionCatalog.controller');

const router = express.Router();

const requireSabyUser = (req, res, next) => {
  if (!req.user || req.user.isSaby !== true) {
    return res.status(403).json({
      code: 403,
      message: 'This action is restricted to SabyUser only',
    });
  }
  return next();
};

router
  .route('/')
  .get(
    subscriptionCatalogController.getSubscriptionCatalog
  )
  .patch(
    auth('payment:update'),
    requireSabyUser,
    validate(subscriptionCatalogValidation.subscriptionCatalogUpdate),
    subscriptionCatalogController.updateSubscriptionCatalog
  );

module.exports = router;
