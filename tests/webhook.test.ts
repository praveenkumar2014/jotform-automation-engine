import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/index.js';
import { redisConnection, submissionQueue } from '../src/queue/queue.js';
import fixture from './fixtures/jotformPayload.json';

vi.mock('../src/queue/queue.js', () => ({
  redisConnection: {
    set: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  },
  submissionQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-1' }),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
  SUBMISSION_QUEUE_NAME: 'jotform-submissions',
}));

vi.mock('../src/db/index.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '1': 1 }]),
    submission: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    form: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe('Webhook Ingestion API', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('should return 401 when WEBHOOK_SECRET_TOKEN is required but invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jotform?secret=wrong-secret',
      payload: fixture,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized: Invalid secret token' });
  });

  it('should return 400 when submissionID or formID is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jotform?secret=super-secure-random-token-xyz',
      payload: { someKey: 'no id here' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Missing submissionID or formID');
  });

  it('should return 200 and enqueue job when valid webhook is posted', async () => {
    // Mock Redis lock acquired
    (redisConnection.set as any).mockResolvedValueOnce('OK');

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jotform?secret=super-secure-random-token-xyz',
      payload: fixture,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('queued');
    expect(body.submissionId).toBe(fixture.submissionID);
    expect(submissionQueue.add).toHaveBeenCalledTimes(1);
  });

  it('should ignore duplicate webhook submission when Redis lock is not acquired', async () => {
    // Mock Redis lock NOT acquired (already locked by concurrent hit)
    (redisConnection.set as any).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jotform?secret=super-secure-random-token-xyz',
      payload: fixture,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('duplicate_ignored');
    expect(submissionQueue.add).not.toHaveBeenCalled();
  });

  it('should respond to health check probe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.dependencies.redis).toBe('up');
  });
});
