const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const adminValidation = require('../../validations/admin.validation');
const adminController = require('../../controllers/admin.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth('admin:create'),
    validate(adminValidation.createAdmin),
    adminController.createAdmin
  )
  .get(
    auth('admin:read'),
    validate(adminValidation.queryAdmins),
    adminController.queryAdmins
  );

router
  .route('/:adminId')
  .get(
    auth('admin:read'),
    validate(adminValidation.getAdminById),
    adminController.getAdminById
  )
  .patch(
    auth('admin:update'),
    validate(adminValidation.updateAdmin),
    adminController.updateAdminById
  )
  .delete(
    auth('admin:delete'),
    validate(adminValidation.deleteAdmin),
    adminController.deleteAdminById
  );

router
  .route('/tenant/:tenantId')
  .get(
    auth('admin:read'),
    validate(adminValidation.getAdminsByTenant),
    adminController.getAdminsByTenant
  );

router
  .route('/assign-role/:adminId')
  .patch(
    auth('admin:assignRole'),
    validate(adminValidation.assignRole),
    adminController.assignRole
  );

router
  .route('/tenant/:tenantId/all')
  .delete(
    auth('admin:delete'),
    validate(adminValidation.deleteAdminsByTenant),
    adminController.deleteAdminsByTenant
  );

module.exports = router;
