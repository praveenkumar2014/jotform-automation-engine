import axios from 'axios';
import { NormalizedSubmission } from '../jotform/normalizer.js';
import { config, logger } from '../../config/index.js';

export interface DispatchResult {
  destination: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class DownstreamDispatcher {
  /**
   * Dispatches normalized submission to configured destinations
   */
  async dispatch(submission: NormalizedSubmission): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    // 1. Generic Downstream Webhook (e.g. CRM, Zapier, custom API)
    if (config.downstream.webhookUrl) {
      try {
        const response = await axios.post(config.downstream.webhookUrl, submission, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        });
        results.push({
          destination: 'downstream_webhook',
          success: true,
          statusCode: response.status,
        });
        logger.info(
          { submissionId: submission.submissionId, destination: config.downstream.webhookUrl },
          'Successfully dispatched submission to downstream webhook'
        );
      } catch (err: any) {
        logger.error(
          { submissionId: submission.submissionId, error: err.message },
          'Failed dispatching submission to downstream webhook'
        );
        results.push({
          destination: 'downstream_webhook',
          success: false,
          error: err.message,
        });
      }
    }

    // 2. Slack Notification
    if (config.downstream.slackWebhookUrl) {
      try {
        const fieldSummary = Object.entries(submission.data)
          .slice(0, 5)
          .map(([k, v]) => `*${k}*: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('\n');

        const slackMessage = {
          text: `🚀 *New Jotform Submission Received* (Form ID: \`${submission.formId}\`)`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📥 New Jotform Submission Received',
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Submission ID:*\n${submission.submissionId}` },
                { type: 'mrkdwn', text: `*Form ID:*\n${submission.formId}` },
                { type: 'mrkdwn', text: `*Created:*\n${submission.createdAt}` },
                { type: 'mrkdwn', text: `*Attached Files:*\n${submission.files.length}` },
              ],
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: fieldSummary ? `*Key Answers:*\n${fieldSummary}` : '_No answer fields parsed_',
              },
            },
          ],
        };

        const slackRes = await axios.post(config.downstream.slackWebhookUrl, slackMessage, {
          timeout: 5000,
        });
        results.push({
          destination: 'slack',
          success: true,
          statusCode: slackRes.status,
        });
        logger.info(
          { submissionId: submission.submissionId },
          'Successfully posted submission notification to Slack'
        );
      } catch (err: any) {
        logger.error(
          { submissionId: submission.submissionId, error: err.message },
          'Failed posting notification to Slack'
        );
        results.push({
          destination: 'slack',
          success: false,
          error: err.message,
        });
      }
    }

    return results;
  }
}

export const dispatcher = new DownstreamDispatcher();
