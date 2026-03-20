const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid('production', 'development', 'staging', 'test')
      .default('development'),
    PORT: Joi.number().default(4000),
    SABYFE_URL: Joi.string().description(
      'Front-end Url_base that for communication'
    ),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    // PostgreSQL configuration
    POSTGRES_HOST: Joi.string()
      .default('localhost')
      .description('PostgreSQL host'),
    POSTGRES_PORT: Joi.number().default(5432).description('PostgreSQL port'),
    POSTGRES_USER: Joi.string()
      .default('postgres')
      .description('PostgreSQL username'),
    POSTGRES_PASSWORD: Joi.string()
      .default('')
      .description('PostgreSQL password'),
    POSTGRES_DB: Joi.string()
      .default('sodzo')
      .description('PostgreSQL database name'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string()
      .allow('')
      .description('server that will send the emails'),
    SMTP_PORT: Joi.number()
      .optional()
      .description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string()
      .allow('')
      .description('username for email server'),
    SMTP_PASSWORD: Joi.string()
      .allow('')
      .description('password for email server'),
    SMTP_SECURE: Joi.string()
      .valid('true', 'false', '')
      .default('false')
      .description('use SSL/TLS for email server'),
    EMAIL_FROM: Joi.string()
      .allow('')
      .description('the from field in the emails sent by the app'),
    SMS_SENDER_ID: Joi.string().allow('').description('Termii sender ID'),
    SMS_BASE_URL: Joi.string().allow('').description('Termii API base URL'),
    SMS_API_KEY: Joi.string().allow('').description('Termii API key'),
    SOCIAL_AUTH_SHARED_SECRET: Joi.string()
      .allow('')
      .description('Shared secret for trusted social-login exchange'),
    REDIS_HOST: Joi.string().default('127.0.0.1').description('Redis host'),
    REDIS_PORT: Joi.number().default(6379).description('Redis port'),
    REDIS_PASSWORD: Joi.string()
      .allow('')
      .optional()
      .description('Redis password'),
    REDIS_DB: Joi.number().default(0).description('Redis DB index'),

    // Socket.IO configuration
    SOCKET_CORS_ORIGIN: Joi.string()
      .default('*')
      .description('Socket.IO CORS origin'),
    SOCKET_PING_TIMEOUT: Joi.number()
      .default(60000)
      .description('Socket.IO ping timeout'),
    SOCKET_PING_INTERVAL: Joi.number()
      .default(25000)
      .description('Socket.IO ping interval'),
    // Email Ingestion Configuration
    DEMO_IMAP_USER: Joi.string()
      .allow('')
      .description('Demo tenant IMAP username'),
    DEMO_IMAP_PASS: Joi.string()
      .allow('')
      .description('Demo tenant IMAP password'),
    DEMO_IMAP_HOST: Joi.string().allow('').description('Demo tenant IMAP host'),
    DEMO_TENANT_ID: Joi.string()
      .default('demo-tenant')
      .description('Demo tenant ID'),
    DEMO_PROJECT_ID: Joi.string()
      .default('test-project')
      .description('Demo project ID'),
    DEMO_FORM_ID: Joi.string().default('test-form').description('Demo form ID'),
    DEMO_NODE_ID: Joi.string().default('test-node').description('Demo node ID'),
    DEMO_AUTHORIZED_SENDERS: Joi.string()
      .allow('')
      .description('Comma-separated list of authorized email senders'),
    SMTP_HOST_EMAIL_INGESTION: Joi.string()
      .allow('')
      .description('server that will send the emails'),
    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: Joi.string()
      .allow('')
      .description('Telegram bot token'),
    TELEGRAM_WEBHOOK_URL: Joi.string()
      .allow('')
      .description('Telegram webhook URL for production'),
    TELEGRAM_POLLING_INTERVAL: Joi.number()
      .default(1000)
      .description('Telegram polling interval in milliseconds'),
    TELEGRAM_SESSION_TTL: Joi.number()
      .default(3600)
      .description('Telegram session TTL in seconds'),

    // Node Sync Configuration
    NODE_SYNC_ENABLED: Joi.boolean()
      .truthy('true')
      .truthy('1')
      .falsy('false')
      .falsy('0')
      .default(false)
      .description('Enable Mongo -> Postgres node dimension sync'),
    NODE_SYNC_BATCH_SIZE: Joi.number()
      .default(250)
      .description('Batch size for node dimension backfill'),

    // WhatsApp Business API Configuration
    PHONE_NUMBER_ID: Joi.string()
      .allow('')
      .description('WhatsApp Business API phone number ID'),
    VERIFY_TOKEN: Joi.string()
      .allow('')
      .description('WhatsApp webhook verify token'),
    WHATSAPP_TOKEN: Joi.string()
      .allow('')
      .description('WhatsApp Business API access token'),
    WHATSAPP_PORT: Joi.number()
      .default(4001)
      .description('Port for the standalone WhatsApp ingestion service'),

    // API Configuration
    EMAIL_INGESTION_API_KEY: Joi.string()
      .allow('')
      .description('API key for email ingestion service'),
    SUBMISSION_API_BASE_URL: Joi.string()
      .default('http://localhost:4000/v1')
      .description('Base URL for submission API'),
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
    // Payment Webhook Configuration
    PAYMENT_WEBHOOK_SECRET: Joi.string()
      .allow('')
      .description('Shared secret used to validate payment webhooks'),
    PAYMENT_WEBHOOK_TOLERANCE_SEC: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(300)
      .description('Max allowed webhook timestamp skew in seconds'),
    PAYMENT_RECONCILIATION_CRON: Joi.string()
      .default('*/5 * * * *')
      .description('Cron schedule for payment reconciliation worker'),
    PAYMENT_RECON_STUCK_MINUTES: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(45)
      .description('Minutes before a processing payment is considered stuck'),
    PAYMENT_RECON_BATCH_SIZE: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(200)
      .description('Max payments processed per reconciliation sweep'),
    COPILOT_WORKER_INTERVAL_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(3000)
      .description('Polling interval for copilot action outbox worker'),
    COPILOT_WORKER_BATCH_SIZE: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(20)
      .description('Batch size per copilot action worker tick'),
    COPILOT_TOOL_TIMEOUT_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(30000)
      .description('Default timeout for copilot tool execution'),
    COPILOT_TOOL_LOCK_TTL_SEC: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(120)
      .description('Default lock TTL for copilot critical tool calls'),
    COPILOT_ONBOARDING_WORKER_CONCURRENCY: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(2)
      .description('Concurrency for onboarding import worker'),
    COPILOT_ONBOARDING_MAX_ROWS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(200000)
      .description('Maximum onboarding CSV rows allowed per upload'),
    COPILOT_ONBOARDING_QUEUE_ATTEMPTS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(4)
      .description('Retry attempts for onboarding import queue jobs'),
    COPILOT_ONBOARDING_QUEUE_BACKOFF_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(5000)
      .description('Initial exponential backoff delay for onboarding import retries'),
    COPILOT_ONBOARDING_CLEANUP_INTERVAL_MS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(3600000)
      .description('Interval for onboarding cleanup maintenance worker'),
    COPILOT_ONBOARDING_FILE_TTL_HOURS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(72)
      .description('Hours to retain uploaded onboarding files after terminal job status'),
    COPILOT_ONBOARDING_ORPHAN_FILE_TTL_HOURS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(168)
      .description('Hours to retain orphan onboarding files in temp directory'),
    COPILOT_ONBOARDING_JOB_RETENTION_DAYS: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(30)
      .description('Days to retain completed/failed/cancelled onboarding jobs before purge'),
    COPILOT_ONBOARDING_MAX_ACTIVE_JOBS_PER_TENANT: Joi.alternatives()
      .try(Joi.number(), Joi.string().pattern(/^\d+/))
      .default(3)
      .description('Max concurrent active onboarding jobs per tenant'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Ensure at least one MongoDB connection string is provided
if (!envVars.MONGO_URI && !envVars.MONGODB_URL) {
  throw new Error('Either MONGO_URI or MONGODB_URL must be provided');
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  clientUrl: envVars.SABYFE_URL,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      family: 4, // Force IPv4 to avoid ::1 connection issues
    },
  },
  postgres: {
    host: envVars.POSTGRES_HOST,
    port: envVars.POSTGRES_PORT,
    user: envVars.POSTGRES_USER,
    password: envVars.POSTGRES_PASSWORD,
    database:
      envVars.POSTGRES_DB + (envVars.NODE_ENV === 'test' ? '_test' : ''),
    connectionString: `postgresql://${envVars.POSTGRES_USER}:${
      envVars.POSTGRES_PASSWORD
    }@${envVars.POSTGRES_HOST}:${envVars.POSTGRES_PORT}/${envVars.POSTGRES_DB}${
      envVars.NODE_ENV === 'test' ? '_test' : ''
    }`,
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
    resetPasswordExpirationMinutes:
      envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE === 'true',
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
    sms_base_url: envVars.SMS_BASE_URL,
    senderId: envVars.SMS_SENDER_ID,
  },
  socialAuth: {
    sharedSecret: envVars.SOCIAL_AUTH_SHARED_SECRET,
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
  nodeSync: {
    enabled: envVars.NODE_SYNC_ENABLED,
    batchSize: Number(envVars.NODE_SYNC_BATCH_SIZE),
  },
  payment: {
    webhookSecret: envVars.PAYMENT_WEBHOOK_SECRET,
    webhookToleranceSec: Number(envVars.PAYMENT_WEBHOOK_TOLERANCE_SEC),
    reconciliation: {
      cron: envVars.PAYMENT_RECONCILIATION_CRON,
      stuckMinutes: Number(envVars.PAYMENT_RECON_STUCK_MINUTES),
      batchSize: Number(envVars.PAYMENT_RECON_BATCH_SIZE),
    },
  },
  copilot: {
    workerIntervalMs: Number(envVars.COPILOT_WORKER_INTERVAL_MS),
    workerBatchSize: Number(envVars.COPILOT_WORKER_BATCH_SIZE),
    toolTimeoutMs: Number(envVars.COPILOT_TOOL_TIMEOUT_MS),
    toolLockTtlSec: Number(envVars.COPILOT_TOOL_LOCK_TTL_SEC),
    onboardingWorkerConcurrency: Number(
      envVars.COPILOT_ONBOARDING_WORKER_CONCURRENCY
    ),
    onboarding: {
      maxRows: Number(envVars.COPILOT_ONBOARDING_MAX_ROWS),
      queueAttempts: Number(envVars.COPILOT_ONBOARDING_QUEUE_ATTEMPTS),
      queueBackoffMs: Number(envVars.COPILOT_ONBOARDING_QUEUE_BACKOFF_MS),
      cleanupIntervalMs: Number(envVars.COPILOT_ONBOARDING_CLEANUP_INTERVAL_MS),
      fileTtlHours: Number(envVars.COPILOT_ONBOARDING_FILE_TTL_HOURS),
      orphanFileTtlHours: Number(envVars.COPILOT_ONBOARDING_ORPHAN_FILE_TTL_HOURS),
      jobRetentionDays: Number(envVars.COPILOT_ONBOARDING_JOB_RETENTION_DAYS),
      maxActiveJobsPerTenant: Number(
        envVars.COPILOT_ONBOARDING_MAX_ACTIVE_JOBS_PER_TENANT
      ),
    },
  },
};
