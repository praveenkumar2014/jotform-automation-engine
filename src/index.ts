import fastify from 'fastify';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { config, logger } from './config/index.js';
import { registerRoutes } from './api/routes.js';
import { createSubmissionWorker } from './queue/workers/submissionWorker.js';
import { redisConnection, submissionQueue } from './queue/queue.js';
import { prisma } from './db/index.js';

export async function buildApp() {
  const app = fastify({
    logger: false, // Using our structured pino logger
    bodyLimit: 10 * 1024 * 1024, // 10MB limit for webhooks
  });

  // Support form-urlencoded requests from Jotform
  await app.register(formbody);

  // Support multipart/form-data requests
  await app.register(multipart, {
    attachFieldsToBody: true,
  });

  // Register all routes
  await registerRoutes(app);

  return app;
}

async function start() {
  const app = await buildApp();

  // Start BullMQ Background Worker
  logger.info('Initializing BullMQ Submission Worker...');
  const worker = createSubmissionWorker();

  // Start HTTP Server
  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`🚀 Ingestion Gateway running at http://${config.host}:${config.port}`);
    logger.info(`📡 Webhook endpoint: http://${config.host}:${config.port}/api/webhooks/jotform`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    try {
      await app.close();
      await worker.close();
      await submissionQueue.close();
      await redisConnection.quit();
      await prisma.$disconnect();
      logger.info('Cleanup complete. Process exiting gracefully.');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start if executed directly
if (process.argv[1] && process.argv[1].endsWith('index.ts') || (process.argv[1] && process.argv[1].endsWith('index.js'))) {
  start();
}
