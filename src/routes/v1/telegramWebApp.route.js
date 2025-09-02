const express = require('express');
const validate = require('../../middlewares/validate');
const telegramWebAppValidation = require('../../validations/telegramWebApp.validation');
const telegramWebAppController = require('../../controllers/telegramWebApp.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

/**
 * @route   POST /api/v1/telegram/auth
 * @desc    Authenticate user via phone number
 * @access  Public
 */
router.post('/auth', validate(telegramWebAppValidation.authenticate), telegramWebAppController.authenticate);

/**
 * @route   GET /api/v1/telegram/projects
 * @desc    Get available projects for authenticated user
 * @access  Private
 */
router.get('/projects', auth(), telegramWebAppController.getProjects);

/**
 * @route   GET /api/v1/telegram/form/:projectId
 * @desc    Get form data for a specific project
 * @access  Private
 */
router.get('/form/:projectId', auth(), validate(telegramWebAppValidation.getForm), telegramWebAppController.getForm);

/**
 * @route   POST /api/v1/telegram/submit
 * @desc    Submit form data
 * @access  Private
 */
router.post('/submit', auth(), validate(telegramWebAppValidation.submit), telegramWebAppController.submitForm);

/**
 * @route   GET /api/v1/telegram/status
 * @desc    Get Web App status and user info
 * @access  Private
 */
router.get('/status', auth(), telegramWebAppController.getStatus);

module.exports = router;
