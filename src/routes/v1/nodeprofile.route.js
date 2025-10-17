const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const nodeProfileValidation = require('../../validations/nodeprofile.validation');
const nodeProfileController = require('../../controllers/nodeprofile.controller');

const router = express.Router();

// Create or update profile (upsert)
router
  .route('/upsert')
  .post(
    auth('update:node'),
    validate(nodeProfileValidation.upsertProfile),
    nodeProfileController.upsertProfile
  );

// CRUD routes
router
  .route('/')
  .post(
    auth('create:node'),
    validate(nodeProfileValidation.createProfile),
    nodeProfileController.createProfile
  );

router
  .route('/node/:nodeId')
  .get(
    auth('view:node'),
    validate(nodeProfileValidation.getProfileByNode),
    nodeProfileController.getProfileByNode
  );

router
  .route('/:profileId')
  .get(
    auth('view:node'),
    validate(nodeProfileValidation.getProfile),
    nodeProfileController.getProfileByNode
  )
  .patch(
    auth('update:node'),
    validate(nodeProfileValidation.updateProfile),
    nodeProfileController.updateProfile
  )
  .delete(
    auth('delete:node'),
    validate(nodeProfileValidation.deleteProfile),
    nodeProfileController.deleteProfile
  );

module.exports = router;

