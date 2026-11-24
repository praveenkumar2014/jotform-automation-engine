import { Queue, QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config, logger } from '../config/index.js';

export const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  logger.info('Connected to Redis successfully');
});

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 5000,
    },
  },
};

export const SUBMISSION_QUEUE_NAME = 'jotform-submissions';

export interface SubmissionJobData {
  submissionId: string;
  formId: string;
  payload: Record<string, any>;
  receivedAt: string;
  headers?: Record<string, any>;
}

export const submissionQueue = new Queue<SubmissionJobData>(
  SUBMISSION_QUEUE_NAME,
  defaultQueueOptions
);
