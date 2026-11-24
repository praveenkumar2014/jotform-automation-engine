import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { JotformClient } from '../src/services/jotform/client.js';

vi.mock('axios');

describe('JotformClient', () => {
  const mockApiKey = 'test_api_key_123';
  let client: JotformClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        response: { use: vi.fn() },
      },
    };
    (axios.create as any).mockReturnValue(mockAxiosInstance);
    client = new JotformClient(mockApiKey);
  });

  it('should initialize with correct API key and default base URL', () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.jotform.com',
        headers: expect.objectContaining({ APIKEY: mockApiKey }),
      })
    );
  });

  it('should fetch form metadata', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        content: {
          id: '240123456789012',
          title: 'Customer Intake Form',
          status: 'ENABLED',
        },
      },
    });

    const form = await client.getForm('240123456789012');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/form/240123456789012');
    expect(form.id).toBe('240123456789012');
    expect(form.title).toBe('Customer Intake Form');
  });

  it('should register a webhook URL', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        content: {
          id: 'wh_98765',
        },
      },
    });

    const res = await client.registerWebhook('240123456789012', 'https://example.com/webhook');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/form/240123456789012/webhooks',
      null,
      {
        params: { webhookURL: 'https://example.com/webhook' },
      }
    );
    expect(res.id).toBe('wh_98765');
  });

  it('should get webhooks for a form', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        content: {
          '0': 'https://example.com/webhook',
        },
      },
    });

    const webhooks = await client.getWebhooks('240123456789012');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/form/240123456789012/webhooks');
    expect(webhooks['0']).toBe('https://example.com/webhook');
  });
});
