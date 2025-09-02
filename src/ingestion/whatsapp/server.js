const express = require('express');
const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');
const whatsappBot = require('./bot');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WhatsApp webhook routes
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  logger.info(`🔍 WhatsApp webhook verification - Mode: ${mode}, Token: ${token}, Expected: ${whatsappBot.VERIFY_TOKEN}`);

  const verificationResult = whatsappBot.verifyWebhook(mode, token, challenge);

  if (verificationResult) {
    logger.info('✅ WhatsApp webhook verification successful');
    res.status(200).send(verificationResult);
  } else {
    logger.warn('❌ WhatsApp webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

app.post('/webhook', async (req, res) => {
  try {
    logger.info('📨 WhatsApp webhook message received');
    await whatsappBot.handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('❌ Error handling WhatsApp webhook:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'WhatsApp Bot Server is running',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// Initialize function
async function initializeWhatsAppServer() {
  try {
    logger.info('🚀 Starting WhatsApp Bot Server...');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Initialize WhatsApp bot
    await whatsappBot.initializeWhatsAppBot();
    logger.info('✅ WhatsApp bot initialized');

    // Start server
    const port = config.whatsapp.port || 4001;
    app.listen(port, () => {
      logger.info(`✅ WhatsApp Bot Server running on port ${port}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`🔗 Webhook URL: http://localhost:${port}/webhook`);
    });
  } catch (error) {
    logger.error('❌ Failed to initialize WhatsApp server:', error.message);
    throw error;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down WhatsApp Bot Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down WhatsApp Bot Server...');
  process.exit(0);
});

// Initialize server when module is loaded
if (require.main === module) {
  initializeWhatsAppServer().catch((error) => {
    logger.error('❌ Failed to initialize WhatsApp server:', error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  initializeWhatsAppServer,
};
