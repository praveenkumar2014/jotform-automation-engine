# Jotform Automation & Processing Service

Production-ready webhook receiver, API client, and background queue processor for Jotform submissions.

## Features
- **High-Throughput Webhook Ingestion:** Fastify/Express HTTP receiver with immediate response (<50ms) and BullMQ job enqueueing.
- **Automatic Schema Mapping:** Converts Jotform's idiosyncratic `qX_field` formats into clean typed JSON.
- **Idempotency Guarantee:** Prevents duplicate processing via Redis distributed locking (`SETNX`) and PostgreSQL primary key constraints.
- **Automated Webhook Setup:** Built-in CLI commands to register webhooks, list webhooks, fetch schemas, and test ingestion.
- **Downstream Dispatching:** Event-driven dispatcher supporting Slack, webhooks, and extensible CRM / AI adapters.
- **Strictly Typed & Tested:** Written in TypeScript with strict mode, full Vitest test suite, and mock fixtures.

---

## Prerequisites
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL & Redis)
- Jotform Account & API Key (Settings -> API -> Create New Key with "Full Access")

---

## Environment Variables (`.env`)

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
WEBHOOK_SECRET_TOKEN=super-secure-random-token-xyz

# Jotform
JOTFORM_API_KEY=your_jotform_api_key_here
JOTFORM_BASE_URL=https://api.jotform.com # or https://eu-api.jotform.com for EU accounts

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jotform_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Downstream Dispatcher (Optional)
DOWNSTREAM_WEBHOOK_URL=
SLACK_WEBHOOK_URL=
```

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Start PostgreSQL & Redis
```bash
docker-compose up -d
```

### 3. Run Database Migrations
```bash
npx prisma generate
npx prisma db push
```

### 4. Run Tests
```bash
npm test
```

### 5. Build and Start Server & Worker
```bash
# Build TypeScript
npm run build

# Start API Server & Worker
npm start

# Or in development mode:
npm run dev
```

### 6. CLI Commands
```bash
# Register a webhook on Jotform
npm run cli register-webhook -- --formId=240123456789012 --url=https://your-public-url.com/api/webhooks/jotform?secret=super-secure-random-token-xyz

# List webhooks on a form
npm run cli get-webhooks -- --formId=240123456789012

# Inspect form questions schema
npm run cli get-schema -- --formId=240123456789012
```

---

## Project Structure
```
├── src/
│   ├── api/
│   │   ├── routes.ts                # HTTP Route definitions
│   │   └── webhooks/jotform.ts      # Ultra-fast webhook receiver & deduplicator
│   ├── config/                      # Environment variables & constants
│   ├── queue/
│   │   ├── queue.ts                 # BullMQ connection & definitions
│   │   └── workers/submissionWorker.ts # Async normalization & persistence worker
│   ├── services/
│   │   ├── jotform/
│   │   │   ├── client.ts            # Jotform v1 REST API client
│   │   │   └── normalizer.ts        # Defensive raw payload -> domain normalizer
│   │   └── dispatcher/              # Downstream integrations (Slack, Webhook, CRM)
│   ├── db/                          # Prisma client instance
│   ├── cli.ts                       # CLI management utility
│   └── index.ts                     # Main entrypoint
├── prisma/
│   └── schema.prisma                # PostgreSQL schema definition
├── tests/
│   ├── fixtures/
│   │   └── jotformPayload.json      # Sample webhook test payloads
│   ├── normalizer.test.ts           # Schema mapping tests
│   ├── client.test.ts               # Jotform API client tests
│   └── webhook.test.ts              # Ingestion API endpoint tests
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
