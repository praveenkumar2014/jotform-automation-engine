import { FastifyInstance } from 'fastify';
import { handleJotformWebhook } from './webhooks/jotform.js';
import { prisma } from '../db/index.js';
import { redisConnection, submissionQueue } from '../queue/queue.js';

export async function registerRoutes(server: FastifyInstance) {
  // Liveness and readiness probe
  server.get('/health', async (_req, reply) => {
    let redisOk = false;
    let postgresOk = false;

    try {
      const pong = await redisConnection.ping();
      redisOk = pong === 'PONG';
    } catch {
      redisOk = false;
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      postgresOk = true;
    } catch {
      postgresOk = false;
    }

    const waitingJobs = await submissionQueue.getWaitingCount();
    const activeJobs = await submissionQueue.getActiveCount();

    const isHealthy = redisOk && postgresOk;

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisOk ? 'up' : 'down',
        postgres: postgresOk ? 'up' : 'down',
      },
      queue: {
        waiting: waitingJobs,
        active: activeJobs,
      },
    });
  });

  // Main Jotform webhook ingestion endpoint
  server.post('/api/webhooks/jotform', handleJotformWebhook);

  // Submissions query endpoints
  server.get('/api/submissions', async (req, reply) => {
    const { formId, limit = '20', offset = '0', status } = req.query as {
      formId?: string;
      limit?: string;
      offset?: string;
      status?: string;
    };

    const where: any = {};
    if (formId) where.formId = formId;
    if (status) where.status = status;

    const submissions = await prisma.submission.findMany({
      where,
      take: Math.min(parseInt(limit, 10), 100),
      skip: parseInt(offset, 10),
      orderBy: { createdAt: 'desc' },
      include: {
        form: {
          select: { title: true },
        },
      },
    });

    const total = await prisma.submission.count({ where });

    return reply.send({
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      submissions,
    });
  });

  server.get('/api/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: { form: true },
    });

    if (!submission) {
      return reply.status(404).send({ error: 'Submission not found' });
    }

    return reply.send(submission);
  });

  // Forms endpoint
  server.get('/api/forms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const form = await prisma.form.findUnique({
      where: { id },
    });

    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    return reply.send(form);
  });
}
