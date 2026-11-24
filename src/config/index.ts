import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  webhookSecretToken: process.env.WEBHOOK_SECRET_TOKEN || '',
  jotform: {
    apiKey: process.env.JOTFORM_API_KEY || '',
    baseUrl: process.env.JOTFORM_BASE_URL || 'https://api.jotform.com',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/jotform_db?schema=public',
  },
  downstream: {
    webhookUrl: process.env.DOWNSTREAM_WEBHOOK_URL || '',
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  },
};

export const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
