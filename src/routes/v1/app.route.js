const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const appValidation = require('../../validations/app.validation');
const appController = require('../../controllers/app.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth('app:create'),
    validate(appValidation.createApp),
    appController.createApp
  )
  .get(
    auth('app:read'),
    validate(appValidation.queryApps),
    appController.queryApps
  );

router
  .route('/bulk-create')
  .post(
    auth('app:import'),
    validate(appValidation.bulkCreateApps),
    appController.bulkCreateApps
  );

router.route('/catalog').get(auth('app:read'), appController.getAppCatalog);

router
  .route('/:appId')
  .get(
    auth('app:read'),
    validate(appValidation.getAppById),
    appController.getAppById
  )
  .patch(
    auth('app:update'),
    validate(appValidation.updateApp),
    appController.updateAppById
  )
  .delete(
    auth('app:delete'),
    validate(appValidation.deleteApp),
    appController.deleteAppById
  );

router
  .route('/assign/:appId')
  .patch(
    auth('app:assign'),
    validate(appValidation.assignApp),
    appController.assignApp
  );

router
  .route('/tenant-or-user/:tenantId/:userId')
  .get(
    auth('app:read'),
    validate(appValidation.getAppsForTenantOrUser),
    appController.getAppsForTenantOrUser
  );

router
  .route('/toggle-status/:appId')
  .patch(
    auth('app:toggleStatus'),
    validate(appValidation.toggleAppStatus),
    appController.toggleAppStatus
  );

router
  .route('/tenant/:tenantId')
  .delete(
    auth('app:delete'),
    validate(appValidation.deleteAppsByTenant),
    appController.deleteAppsByTenant
  );

module.exports = router;
