const express = require('express');
const auth = require('../../middlewares/auth');
const subscriptionController = require('../../controllers/subscription.controller');

const router = express.Router();

router.route('/current').get(auth(), subscriptionController.getCurrentSubscription);
router.route('/current/cancel').post(auth(), subscriptionController.cancelCurrentSubscription);
router.route('/studio-access').get(auth(), subscriptionController.getStudioAccessState);
router.route('/preview').post(auth(), subscriptionController.previewSubscriptionChange);

module.exports = router;
