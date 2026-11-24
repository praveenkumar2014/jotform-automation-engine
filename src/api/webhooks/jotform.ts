import { FastifyRequest, FastifyReply } from 'fastify';
import { submissionQueue, redisConnection } from '../../queue/queue.js';
import { config, logger } from '../../config/index.js';

interface WebhookQuery {
  secret?: string;
  token?: string;
}

export async function handleJotformWebhook(
  req: FastifyRequest<{ Querystring: WebhookQuery }>,
  reply: FastifyReply
) {
  const startTime = Date.now();

  try {
    // 1. Verify Shared Secret / Token if configured
    const providedSecret = req.query.secret || req.query.token;
    if (config.webhookSecretToken) {
      if (!providedSecret || providedSecret !== config.webhookSecretToken) {
        logger.warn(
          { ip: req.ip, providedSecret: providedSecret ? '[REDACTED]' : 'none' },
          'Unauthorized webhook attempt: invalid or missing secret token'
        );
        return reply.status(401).send({ error: 'Unauthorized: Invalid secret token' });
      }
    }

    // 2. Extract Body and rawRequest
    const body = (req.body as Record<string, any>) || {};
    let rawRequest: Record<string, any> = {};

    if (body.rawRequest) {
      if (typeof body.rawRequest === 'string') {
        try {
          rawRequest = JSON.parse(body.rawRequest);
        } catch (err) {
          logger.warn('Failed parsing rawRequest as JSON string, falling back to raw body');
          rawRequest = body;
        }
      } else if (typeof body.rawRequest === 'object') {
        rawRequest = body.rawRequest;
      }
    } else {
      rawRequest = body;
    }

    // Identify submission ID and form ID defensively
    const submissionId =
      body.submissionID ||
      rawRequest.submissionID ||
      body.id ||
      rawRequest.id;

    const formId =
      body.formID ||
      rawRequest.formID ||
      body.form_id ||
      rawRequest.form_id;

    if (!submissionId || !formId) {
      logger.warn(
        { bodyKeys: Object.keys(body), rawRequestKeys: Object.keys(rawRequest) },
        'Received Jotform webhook missing submissionID or formID'
      );
      return reply.status(400).send({
        error: 'Missing submissionID or formID in webhook payload',
      });
    }

    const subIdStr = String(submissionId);
    const formIdStr = String(formId);

    // 3. Fast Atomic Redis Deduplication Lock Check (5-minute TTL)
    const lockKey = `lock:jotform:sub:${subIdStr}`;
    const acquired = await redisConnection.set(lockKey, '1', 'EX', 300, 'NX');

    if (!acquired) {
      logger.info(
        { submissionId: subIdStr },
        'Duplicate webhook hit detected via Redis lock. Returning 200 OK without re-queueing.'
      );
      return reply.status(200).send({
        status: 'duplicate_ignored',
        submissionId: subIdStr,
        formId: formIdStr,
      });
    }

    // 4. Enqueue Job for Asynchronous BullMQ Worker
    const receivedAt = new Date().toISOString();
    await submissionQueue.add(
      'process-submission',
      {
        submissionId: subIdStr,
        formId: formIdStr,
        payload: rawRequest,
        receivedAt,
        headers: req.headers as Record<string, any>,
      },
      {
        jobId: `sub-${subIdStr}`, // BullMQ native deduplication
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );

    const elapsedMs = Date.now() - startTime;
    logger.info(
      { submissionId: subIdStr, formId: formIdStr, elapsedMs },
      'Webhook received, deduplicated, and enqueued successfully'
    );

    // 5. Immediate Fast Response (<50ms) to satisfy Jotform 10s timeout
    return reply.status(200).send({
      status: 'queued',
      submissionId: subIdStr,
      formId: formIdStr,
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Error handling Jotform webhook');
    return reply.status(500).send({ error: 'Internal processing error' });
  }
}
