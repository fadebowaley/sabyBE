const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const validation = require('../../validations/workItem.validation');
const controller = require('../../controllers/workItem.controller');

const router = express.Router();
router
  .route('/')
  .get(
    auth('calendar:read'),
    validate(validation.queryWorkItems),
    controller.queryWorkItems
  )
  .post(
    auth('calendar:manage'),
    validate(validation.createWorkItem),
    controller.createWorkItem
  );
router.post(
  '/import',
  auth('calendar:manage'),
  validate(validation.importWorkItems),
  controller.importWorkItems
);
router.post(
  '/generate-meeting',
  auth('calendar:manage'),
  validate(validation.generateMeeting),
  controller.generateMeeting
);

router.get(
  '/public/:workItemId',
  validate(validation.getPublicWorkItem),
  controller.getPublicWorkItem
);

router.post(
  '/public/:workItemId/resources',
  validate(validation.addResource),
  controller.addPublicResource
);

router
  .route('/:workItemId')
  .get(
    auth('calendar:read'),
    validate(validation.getWorkItem),
    controller.getWorkItem
  )
  .patch(
    auth('calendar:manage'),
    validate(validation.updateWorkItem),
    controller.updateWorkItem
  )
  .delete(
    auth('calendar:manage'),
    validate(validation.getWorkItem),
    controller.deleteWorkItem
  );
module.exports = router;
