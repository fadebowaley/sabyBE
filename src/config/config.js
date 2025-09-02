const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').default('development'),
    PORT: Joi.number().default(4000),
    HALOFE_URL: Joi.string().description('Front-end Url_base that for communication'),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    // PostgreSQL configuration
    POSTGRES_HOST: Joi.string().default('localhost').description('PostgreSQL host'),
    POSTGRES_PORT: Joi.number().default(5432).description('PostgreSQL port'),
    POSTGRES_USER: Joi.string().default('postgres').description('PostgreSQL username'),
    POSTGRES_PASSWORD: Joi.string().default('').description('PostgreSQL password'),
    POSTGRES_DB: Joi.string().default('sodzo').description('PostgreSQL database name'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMS_API_KEY: Joi.string().description('sendar.io sms api keys for transactional message'),
    SENDAR_API_URL: Joi.string().description('sendar.io sms api keys for transactional message'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),

    REDIS_HOST: Joi.string().default('127.0.0.1').description('Redis host'),
    REDIS_PORT: Joi.number().default(6379).description('Redis port'),
    REDIS_PASSWORD: Joi.string().allow('').optional().description('Redis password'),
    REDIS_DB: Joi.number().default(0).description('Redis DB index'),

    // Socket.IO configuration
    SOCKET_CORS_ORIGIN: Joi.string().default('*').description('Socket.IO CORS origin'),
    SOCKET_PING_TIMEOUT: Joi.number().default(60000).description('Socket.IO ping timeout'),
    SOCKET_PING_INTERVAL: Joi.number().default(25000).description('Socket.IO ping interval'),

    // Email Ingestion Configuration
    DEMO_IMAP_USER: Joi.string().description('Demo tenant IMAP username'),
    DEMO_IMAP_PASS: Joi.string().description('Demo tenant IMAP password'),
    DEMO_IMAP_HOST: Joi.string().description('Demo tenant IMAP host'),
    DEMO_TENANT_ID: Joi.string().default('demo-tenant').description('Demo tenant ID'),
    DEMO_PROJECT_ID: Joi.string().default('test-project').description('Demo project ID'),
    DEMO_FORM_ID: Joi.string().default('test-form').description('Demo form ID'),
    DEMO_NODE_ID: Joi.string().default('test-node').description('Demo node ID'),
    DEMO_AUTHORIZED_SENDERS: Joi.string().description('Comma-separated list of authorized email senders'),
    SMTP_HOST_EMAIL_INGESTION: Joi.string().description('server that will send the emails'),

    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: Joi.string().description('Telegram bot token'),
    TELEGRAM_WEBHOOK_URL: Joi.string().description('Telegram webhook URL for production'),
    TELEGRAM_POLLING_INTERVAL: Joi.number().default(1000).description('Telegram polling interval in milliseconds'),
    TELEGRAM_SESSION_TTL: Joi.number().default(3600).description('Telegram session TTL in seconds'),

    // WhatsApp Business API Configuration
    PHONE_NUMBER_ID: Joi.string().description('WhatsApp Business API phone number ID'),
    VERIFY_TOKEN: Joi.string().description('WhatsApp webhook verify token'),
    WHATSAPP_TOKEN: Joi.string().description('WhatsApp Business API access token'),

    // API Configuration
    EMAIL_INGESTION_API_KEY: Joi.string().description('API key for email ingestion service'),
    SUBMISSION_API_BASE_URL: Joi.string().default('http://localhost:4000/v1').description('Base URL for submission API'),
    SUBMISSION_API_TIMEOUT_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(10000)
      .description('Timeout for submission API requests'),
    SUBMISSION_API_MAX_RETRIES: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(3)
      .description('Maximum retries for submission API requests'),

    // Worker Configuration
    EMAIL_INGESTOR_INTERVAL_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(60000)
      .description('Email ingestion polling interval in milliseconds'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  clientUrl: envVars.HALOFE_URL,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      useCreateIndex: true,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferCommands: true,
      bufferMaxEntries: 0,
      maxPoolSize: 10,
      minPoolSize: 1,
    },
  },
  postgres: {
    host: envVars.POSTGRES_HOST,
    port: envVars.POSTGRES_PORT,
    user: envVars.POSTGRES_USER,
    password: envVars.POSTGRES_PASSWORD,
    database: envVars.POSTGRES_DB + (envVars.NODE_ENV === 'test' ? '_test' : ''),
    connectionString: `postgresql://${envVars.POSTGRES_USER}:${envVars.POSTGRES_PASSWORD}@${envVars.POSTGRES_HOST}:${
      envVars.POSTGRES_PORT
    }/${envVars.POSTGRES_DB}${envVars.NODE_ENV === 'test' ? '_test' : ''}`,
  },

  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
  },

  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  smtp: {
    username: envVars.SMTP_USERNAME,
    password: envVars.SMTP_PASSWORD,
    from: envVars.EMAIL_FROM || envVars.SMTP_USERNAME,
  },
  sms: {
    sms_api_key: envVars.SMS_API_KEY,
    sendar_api_url: envVars.SENDAR_API_URL,
  },

  socket: {
    cors: {
      origin: envVars.SOCKET_CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    pingTimeout: envVars.SOCKET_PING_TIMEOUT,
    pingInterval: envVars.SOCKET_PING_INTERVAL,
  },

  // Email Ingestion Configuration
  emailIngestion: {
    demo: {
      imapUser: envVars.DEMO_IMAP_USER,
      imapPass: envVars.DEMO_IMAP_PASS,
      imapHost: envVars.DEMO_IMAP_HOST,
      tenantId: envVars.DEMO_TENANT_ID,
      projectId: envVars.DEMO_PROJECT_ID,
      formId: envVars.DEMO_FORM_ID,
      nodeId: envVars.DEMO_NODE_ID,
      authorizedSenders: envVars.DEMO_AUTHORIZED_SENDERS
        ? envVars.DEMO_AUTHORIZED_SENDERS.split(',').map((s) => s.trim())
        : [],
    },
    apiKey: envVars.EMAIL_INGESTION_API_KEY,
    submissionApi: {
      baseUrl: envVars.SUBMISSION_API_BASE_URL,
      timeoutMs: Number(envVars.SUBMISSION_API_TIMEOUT_MS),
      maxRetries: Number(envVars.SUBMISSION_API_MAX_RETRIES),
    },
    worker: {
      intervalMs: Number(envVars.EMAIL_INGESTOR_INTERVAL_MS),
    },
  },

  // Telegram Bot Configuration
  telegram: {
    botToken: envVars.TELEGRAM_BOT_TOKEN,
    webhookUrl: envVars.TELEGRAM_WEBHOOK_URL,
    pollingInterval: Number(envVars.TELEGRAM_POLLING_INTERVAL),
    sessionTtl: Number(envVars.TELEGRAM_SESSION_TTL),
  },

  // WhatsApp Business API Configuration
  whatsapp: {
    phoneNumberId: envVars.PHONE_NUMBER_ID,
    verifyToken: envVars.VERIFY_TOKEN,
    accessToken: envVars.WHATSAPP_TOKEN,
    port: Number(envVars.WHATSAPP_PORT) || 4001,
  },
};
