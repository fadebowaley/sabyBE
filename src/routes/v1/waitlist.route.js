const express = require('express');
const validate = require('../../middlewares/validate');
const waitlistValidation = require('../../validations/waitlist.validation');
const waitlistController = require('../../controllers/waitlist.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Public route - no authentication required
router
  .route('/')
  .post(
    validate(waitlistValidation.createWaitlistEntry),
    waitlistController.createWaitlistEntry
  );

// Protected routes - require authentication (SabyUser only)
router
  .route('/admin')
  .get(
    auth('manageSabyUsers'),
    validate(waitlistValidation.getWaitlistEntries),
    waitlistController.getWaitlistEntries
  );

router
  .route('/admin/stats')
  .get(auth('manageSabyUsers'), waitlistController.getWaitlistStats);

router
  .route('/admin/export')
  .get(
    auth('manageSabyUsers'),
    validate(waitlistValidation.exportWaitlist),
    waitlistController.exportWaitlist
  );

router
  .route('/admin/:id')
  .patch(
    auth('manageSabyUsers'),
    validate(waitlistValidation.updateWaitlistStatus),
    waitlistController.updateWaitlistStatus
  )
  .delete(
    auth('manageSabyUsers'),
    validate(waitlistValidation.deleteWaitlistEntry),
    waitlistController.deleteWaitlistEntry
  );

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Waitlist
 *   description: Waitlist management and signup
 */

/**
 * @swagger
 * /waitlist:
 *   post:
 *     summary: Join the waitlist
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               userType:
 *                 type: string
 *                 enum: [developer, investor, organization]
 *               referralSource:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       "201":
 *         description: Created
 *       "400":
 *         description: Email already registered
 */

