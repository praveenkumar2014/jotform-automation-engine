import { Worker, Job } from 'bullmq';
import { SUBMISSION_QUEUE_NAME, SubmissionJobData, redisConnection } from '../queue.js';
import { normalizeJotformPayload } from '../../services/jotform/normalizer.js';
import { JotformClient } from '../../services/jotform/client.js';
import { dispatcher } from '../../services/dispatcher/index.js';
import { prisma } from '../../db/index.js';
import { config, logger } from '../../config/index.js';

const jotformClient = new JotformClient(
  config.jotform.apiKey || 'placeholder',
  config.jotform.baseUrl,
  redisConnection
);

export async function processSubmissionJob(job: Job<SubmissionJobData>) {
  const { submissionId, formId, payload, receivedAt, headers } = job.data;
  logger.info({ jobId: job.id, submissionId, formId }, 'Processing Jotform submission job');

  try {
    // 1. Check Database Idempotency
    const existingSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (existingSubmission && existingSubmission.status === 'PROCESSED') {
      logger.info(
        { submissionId },
        'Submission already processed in database. Skipping duplicate job execution.'
      );
      return { status: 'already_processed', submissionId };
    }

    // 2. Fetch Form Questions Schema for Canonical Normalization (cached in Redis)
    let questionsMap: Record<string, any> | undefined;
    if (config.jotform.apiKey && config.jotform.apiKey !== 'placeholder') {
      try {
        questionsMap = await jotformClient.getQuestions(formId);
      } catch (err: any) {
        logger.warn(
          { formId, error: err.message },
          'Could not fetch questions schema from Jotform API. Falling back to heuristic normalization.'
        );
      }
    }

    // 3. Normalize Raw Payload
    const normalized = normalizeJotformPayload(
      submissionId,
      formId,
      payload,
      questionsMap,
      receivedAt
    );

    // 4. Ensure Form Record Exists in DB (upsert)
    await prisma.form.upsert({
      where: { id: formId },
      update: {
        schemaCache: (questionsMap as any) || undefined,
        updatedAt: new Date(),
      },
      create: {
        id: formId,
        title: `Form ${formId}`,
        status: 'ACTIVE',
        schemaCache: (questionsMap as any) || undefined,
      },
    });

    // 5. Upsert Submission Record in PostgreSQL
    const savedSubmission = await prisma.submission.upsert({
      where: { id: submissionId },
      update: {
        rawPayload: payload as any,
        normalizedData: normalized.data as any,
        status: 'PROCESSED',
        errorMessage: null,
        processedAt: new Date(),
      },
      create: {
        id: submissionId,
        formId,
        rawPayload: payload as any,
        normalizedData: normalized.data as any,
        status: 'PROCESSED',
        processedAt: new Date(),
        createdAt: new Date(receivedAt),
      },
    });

    // 6. Log Webhook Hit in DB
    try {
      await prisma.webhookLog.create({
        data: {
          formId,
          submissionId,
          headers: (headers as any) || {},
          payload: payload as any,
          receivedAt: new Date(receivedAt),
        },
      });
    } catch (logErr) {
      logger.warn({ logErr }, 'Non-critical: Failed to write webhook log entry');
    }

    // 7. Dispatch Downstream Integrations (Slack, Webhooks, CRM)
    const dispatchResults = await dispatcher.dispatch(normalized);

    logger.info(
      { submissionId, dispatchCount: dispatchResults.length },
      'Submission successfully processed and dispatched'
    );

    return {
      status: 'success',
      submissionId,
      dispatched: dispatchResults,
    };
  } catch (error: any) {
    logger.error(
      { jobId: job.id, submissionId, formId, error: error.message, stack: error.stack },
      'Failed processing Jotform submission job'
    );

    // Mark submission status as FAILED in DB if possible
    try {
      await prisma.submission.upsert({
        where: { id: submissionId },
        update: {
          status: 'FAILED',
          errorMessage: error.message,
        },
        create: {
          id: submissionId,
          formId,
          rawPayload: payload as any,
          normalizedData: {},
          status: 'FAILED',
          errorMessage: error.message,
          createdAt: new Date(receivedAt),
        },
      });
    } catch (dbErr) {
      logger.error({ dbErr }, 'Failed updating submission status to FAILED in DB');
    }

    throw error; // Re-throw so BullMQ handles retries & backoff
  }
}

export function createSubmissionWorker(concurrency = 5) {
  const worker = new Worker<SubmissionJobData>(
    SUBMISSION_QUEUE_NAME,
    async (job) => processSubmissionJob(job),
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, submissionId: job.data.submissionId }, 'Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, error: err.message },
      'Job processing failed'
    );
  });

  return worker;
}
