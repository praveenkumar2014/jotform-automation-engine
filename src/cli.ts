#!/usr/bin/env node
import { JotformClient } from './services/jotform/client.js';
import { config, logger } from './config/index.js';

function parseArgs(args: string[]): { command: string; flags: Record<string, string> } {
  const command = args[0] || 'help';
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value !== undefined ? value : args[++i] || 'true';
    }
  }

  return { command, flags };
}

async function run() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!config.jotform.apiKey || config.jotform.apiKey === 'placeholder') {
    console.error('❌ Error: JOTFORM_API_KEY environment variable is missing or placeholder.');
    process.exit(1);
  }

  const client = new JotformClient(config.jotform.apiKey, config.jotform.baseUrl);

  try {
    switch (command) {
      case 'register-webhook': {
        const formId = flags.formId;
        const webhookUrl = flags.url || flags.webhookUrl;

        if (!formId || !webhookUrl) {
          console.error('❌ Usage: npm run cli register-webhook -- --formId=<ID> --url=<WEBHOOK_URL>');
          process.exit(1);
        }

        console.log(`📡 Registering webhook on form ${formId} -> ${webhookUrl}...`);
        const result = await client.registerWebhook(formId, webhookUrl);
        console.log('✅ Webhook successfully registered:', result);
        break;
      }

      case 'get-webhooks': {
        const formId = flags.formId;
        if (!formId) {
          console.error('❌ Usage: npm run cli get-webhooks -- --formId=<ID>');
          process.exit(1);
        }

        console.log(`🔍 Fetching webhooks for form ${formId}...`);
        const webhooks = await client.getWebhooks(formId);
        console.log('📋 Registered webhooks:', JSON.stringify(webhooks, null, 2));
        break;
      }

      case 'delete-webhook': {
        const formId = flags.formId;
        const webhookId = flags.webhookId;

        if (!formId || !webhookId) {
          console.error('❌ Usage: npm run cli delete-webhook -- --formId=<ID> --webhookId=<WEBHOOK_ID>');
          process.exit(1);
        }

        console.log(`🗑️ Deleting webhook ${webhookId} from form ${formId}...`);
        const result = await client.deleteWebhook(formId, webhookId);
        console.log('✅ Webhook deleted:', result);
        break;
      }

      case 'get-schema': {
        const formId = flags.formId;
        if (!formId) {
          console.error('❌ Usage: npm run cli get-schema -- --formId=<ID>');
          process.exit(1);
        }

        console.log(`📋 Fetching question schema for form ${formId}...`);
        const schema = await client.getQuestions(formId, true);
        console.log('Schema:', JSON.stringify(schema, null, 2));
        break;
      }

      case 'get-submissions': {
        const formId = flags.formId;
        const limit = flags.limit ? parseInt(flags.limit, 10) : 10;

        if (!formId) {
          console.error('❌ Usage: npm run cli get-submissions -- --formId=<ID> [--limit=10]');
          process.exit(1);
        }

        console.log(`📥 Fetching submissions for form ${formId}...`);
        const submissions = await client.getSubmissions(formId, limit);
        console.log(`Found ${submissions.length} submissions:`, JSON.stringify(submissions, null, 2));
        break;
      }

      case 'help':
      default: {
        console.log(`
Jotform Automation Engine CLI

Commands:
  register-webhook   Register callback URL on a form
                     --formId=<ID> --url=<URL>

  get-webhooks       List active webhooks on a form
                     --formId=<ID>

  delete-webhook     Delete a webhook from a form
                     --formId=<ID> --webhookId=<ID>

  get-schema         Get form question definition schema
                     --formId=<ID>

  get-submissions    Fetch submissions for a form
                     --formId=<ID> [--limit=10]
`);
        break;
      }
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'CLI Execution failed');
    console.error('❌ Error executing CLI command:', error.response?.data || error.message);
    process.exit(1);
  }
}

run();
