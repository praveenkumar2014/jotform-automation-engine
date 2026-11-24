# CODEX PROMPT TEMPLATE FOR INSTANT GENERATION

You can paste this prompt directly into Codex, Claude Code, Cursor, or ChatGPT to build the entire system:

```text
Build a complete, production-ready Jotform automation system in TypeScript using Fastify and BullMQ.

Context & Specifications:
1. Refer to the architecture in the handover spec.
2. Setup the JotformClient in `src/services/jotform/client.ts` using the official Jotform REST API v1.
3. Build the webhook handler in `src/api/webhooks/jotform.ts` with token authentication, rawRequest parsing, Redis SETNX deduplication, and BullMQ queue dispatch.
4. Implement the BullMQ worker in `src/queue/workers/submissionWorker.ts` which pulls jobs, runs `normalizeJotformPayload`, saves the record into PostgreSQL using Prisma, and dispatches to downstream webhooks.
5. Provide a CLI script in `src/cli.ts` to register the webhook URL with Jotform API (`POST /form/{formId}/webhooks`).
6. Include Prisma schema, docker-compose.yml (Postgres + Redis), and full Vitest unit/integration tests with sample Jotform fixtures.
Make all TypeScript code strictly typed with comprehensive error handling and logging via Pino.
```
