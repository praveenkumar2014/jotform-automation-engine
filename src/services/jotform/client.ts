import axios, { AxiosInstance, AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { logger } from '../../config/index.js';

export interface JotformQuestion {
  qid: string;
  name: string;
  type: string;
  text: string;
  order: string;
  required?: string;
  options?: string;
  sublabels?: Record<string, string>;
  [key: string]: any;
}

export interface JotformFormMetadata {
  id: string;
  username: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  new: string;
  count: string;
  url?: string;
}

export interface JotformSubmissionAnswer {
  name: string;
  text: string;
  type: string;
  answer: any;
  prettyFormat?: string;
}

export interface JotformSubmission {
  id: string;
  form_id: string;
  ip: string;
  created_at: string;
  status: string;
  new: string;
  answers: Record<string, JotformSubmissionAnswer>;
}

export interface CreateFormQuestion {
  type: string;
  text: string;
  order: number;
  required?: boolean;
  options?: string;
}

export class JotformClient {
  private http: AxiosInstance;
  private redis?: Redis;

  constructor(
    private apiKey: string,
    private baseURL = 'https://api.jotform.com',
    redisClient?: Redis
  ) {
    if (!apiKey) {
      throw new Error('JOTFORM_API_KEY is required for JotformClient');
    }

    this.redis = redisClient;
    this.http = axios.create({
      baseURL: this.baseURL,
      headers: {
        APIKEY: this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Setup Axios response interceptor for retry on 429 Rate Limit with exponential backoff & jitter
    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as any;
        if (!config) return Promise.reject(error);

        config.__retryCount = config.__retryCount || 0;

        if (error.response?.status === 429 && config.__retryCount < 3) {
          config.__retryCount += 1;
          const baseDelay = 1000 * Math.pow(2, config.__retryCount);
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          logger.warn(
            { retryCount: config.__retryCount, delayMs: delay, url: config.url },
            'Jotform API 429 Rate Limit encountered. Retrying with exponential backoff...'
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.http(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Retrieves form metadata
   */
  async getForm(formId: string): Promise<JotformFormMetadata> {
    const res = await this.http.get(`/form/${formId}`);
    return res.data.content;
  }

  /**
   * Retrieves questions schema for a form with optional Redis 1-hour TTL caching
   */
  async getQuestions(
    formId: string,
    bypassCache = false
  ): Promise<Record<string, JotformQuestion>> {
    const cacheKey = `jotform:form:${formId}:questions`;

    if (this.redis && !bypassCache) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          logger.debug({ formId }, 'Fetched form questions schema from Redis cache');
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ err }, 'Failed reading from Redis cache for form questions');
      }
    }

    const res = await this.http.get(`/form/${formId}/questions`);
    const questions: Record<string, JotformQuestion> = res.data.content;

    if (this.redis && questions) {
      try {
        // Cache for 1 hour (3600 seconds)
        await this.redis.set(cacheKey, JSON.stringify(questions), 'EX', 3600);
        logger.debug({ formId }, 'Cached form questions schema in Redis with 1h TTL');
      } catch (err) {
        logger.warn({ err }, 'Failed caching form questions in Redis');
      }
    }

    return questions;
  }

  /**
   * Registers a webhook callback URL on the given form
   */
  async registerWebhook(formId: string, webhookUrl: string): Promise<{ id: string }> {
    const res = await this.http.post(`/form/${formId}/webhooks`, null, {
      params: { webhookURL: webhookUrl },
    });
    return res.data.content;
  }

  /**
   * Lists registered webhooks for a form
   */
  async getWebhooks(formId: string): Promise<Record<string, string>> {
    const res = await this.http.get(`/form/${formId}/webhooks`);
    return res.data.content;
  }

  /**
   * Deletes a registered webhook by webhook ID
   */
  async deleteWebhook(formId: string, webhookId: string): Promise<{ id: string }> {
    const res = await this.http.delete(`/form/${formId}/webhooks/${webhookId}`);
    return res.data.content;
  }

  /**
   * Fetches submissions with pagination
   */
  async getSubmissions(
    formId: string,
    limit = 20,
    offset = 0,
    orderby = 'created_at'
  ): Promise<JotformSubmission[]> {
    const res = await this.http.get(`/form/${formId}/submissions`, {
      params: { limit, offset, orderby },
    });
    return res.data.content;
  }

  /**
   * Fetches a single submission by submission ID
   */
  async getSubmission(submissionId: string): Promise<JotformSubmission> {
    const res = await this.http.get(`/submission/${submissionId}`);
    return res.data.content;
  }

  /**
   * Programmatically creates a new form with questions
   */
  async createForm(
    title: string,
    questions: CreateFormQuestion[]
  ): Promise<JotformFormMetadata> {
    const formQuestions: Record<string, any> = {};

    questions.forEach((q, index) => {
      formQuestions[index.toString()] = {
        type: q.type,
        text: q.text,
        order: String(q.order),
        required: q.required ? 'Yes' : 'No',
        options: q.options || '',
      };
    });

    const payload = {
      properties: {
        title,
      },
      questions: formQuestions,
    };

    const res = await this.http.post('/user/forms', payload);
    return res.data.content;
  }
}
