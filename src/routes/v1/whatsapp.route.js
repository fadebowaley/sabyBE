const express = require('express');
const validate = require('../../middlewares/validate');
const whatsappValidation = require('../../validations/whatsapp.validation');
const whatsappController = require('../../controllers/whatsapp.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

/**
 * @route   GET /v1/whatsapp/webhook
 * @desc    Verify WhatsApp webhook
 * @access  Public
 */
router.get('/webhook', whatsappController.verifyWebhook);

/**
 * @route   POST /v1/whatsapp/webhook
 * @desc    Handle WhatsApp webhook messages
 * @access  Public
 */
router.post('/webhook', whatsappController.handleWebhook);

/**
 * @route   POST /v1/whatsapp/send-message
 * @desc    Send a message via WhatsApp
 * @access  Private
 */
router.post('/send-message', auth(), validate(whatsappValidation.sendMessage), whatsappController.sendMessage);

/**
 * @route   GET /v1/whatsapp/status
 * @desc    Get WhatsApp bot status
 * @access  Private
 */
router.get('/status', auth(), whatsappController.getStatus);

/**
 * @route   POST /v1/whatsapp/restart
 * @desc    Restart WhatsApp bot
 * @access  Private
 */
router.post('/restart', auth(), whatsappController.restartBot);

/**
 * @route   GET /v1/whatsapp/sessions
 * @desc    Get active WhatsApp sessions
 * @access  Private
 */
router.get('/sessions', auth(), whatsappController.getSessions);

/**
 * @route   DELETE /v1/whatsapp/sessions/:phoneNumber
 * @desc    Delete a WhatsApp session
 * @access  Private
 */
router.delete('/sessions/:phoneNumber', auth(), whatsappController.deleteSession);

module.exports = router;
