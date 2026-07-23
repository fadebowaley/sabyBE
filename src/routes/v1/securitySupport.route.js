const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const securitySupportValidation = require('../../validations/securitySupport.validation');
const securitySupportController = require('../../controllers/securitySupport.controller');

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
  .route('/users')
  .get(
    validate(securitySupportValidation.listSecuritySupportUsers),
    securitySupportController.listSecuritySupportUsers
  );

router
  .route('/users/:userId/actions')
  .post(
    validate(securitySupportValidation.performSecuritySupportAction),
    securitySupportController.performSecuritySupportAction
  );

module.exports = router;
