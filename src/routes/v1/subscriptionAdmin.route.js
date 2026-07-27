const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const subscriptionAdminValidation = require('../../validations/subscriptionAdmin.validation');
const subscriptionAdminController = require('../../controllers/subscriptionAdmin.controller');

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

router.use(auth(), requireSabyUser);

router
  .route('/')
  .get(
    validate(subscriptionAdminValidation.listAdminSubscriptions),
    subscriptionAdminController.listAdminSubscriptions
  )
  .post(
    validate(subscriptionAdminValidation.createAdminSubscription),
    subscriptionAdminController.createAdminSubscription
  );

router
  .route('/tenants/:tenantId/delete-preview')
  .get(
    validate(subscriptionAdminValidation.previewTenantDeletion),
    subscriptionAdminController.previewTenantDeletion
  );

router
  .route('/tenants/:tenantId')
  .delete(
    validate(subscriptionAdminValidation.deleteTenant),
    subscriptionAdminController.deleteTenant
  );

router
  .route('/:subscriptionId')
  .patch(
    validate(subscriptionAdminValidation.updateAdminSubscription),
    subscriptionAdminController.updateAdminSubscription
  );

router
  .route('/:subscriptionId/status')
  .post(
    validate(subscriptionAdminValidation.updateAdminSubscriptionStatus),
    subscriptionAdminController.updateAdminSubscriptionStatus
  );

router
  .route('/:subscriptionId/trial')
  .post(
    validate(subscriptionAdminValidation.startOrExtendTrial),
    subscriptionAdminController.startOrExtendTrial
  );

module.exports = router;
