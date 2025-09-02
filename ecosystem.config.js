module.exports = {
  apps: [
    {
      name: 'haloBE-whatsapp-bot',
      script: 'src/ingestion/whatsapp/server.js',
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4001,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: './logs/whatsapp-bot.log',
      out_file: './logs/whatsapp-bot-out.log',
      error_file: './logs/whatsapp-bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
