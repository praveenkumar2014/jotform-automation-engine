# SYSTEM ARCHITECTURE: JOTFORM AUTOMATION ENGINE

## 1. High-Level Flow Diagram
```
[ User / End-Client ]
          │
          ▼
[ Jotform Form (Hosted / Embedded) ]
          │
          │ (HTTP POST Webhook on Submission)
          ▼
┌────────────────────────────────────────────────────────┐
│ Ingestion Gateway (Fastify / Express API)              │
│  ├─ Verify Webhook Secret / Origin                     │
│  ├─ Extract rawRequest & submissionID                  │
│  └─ Push Job -> Redis / BullMQ ("jotform-submissions") │
└──────────────────────────┬─────────────────────────────┘
                           │ (Async Event)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Worker Processing Layer (BullMQ Workers)               │
│  ├─ Check Idempotency Key (Redis SETNX / Postgres)     │
│  ├─ Schema Normalizer (maps qID_field -> domain model) │
│  ├─ Data Enrichment (Jotform API Client if file URLs)  │
│  └─ Persistent Storage (PostgreSQL Submissions Table)  │
└──────────────────────────┬─────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
  ┌──────────────┐                    ┌──────────────┐
  │ Downstream   │                    │ Notification │
  │ Dispatcher   │                    │ & AI Agent   │
  │ (CRM/Slack)  │                    │ (Summary/LLM)│
  └──────────────┘                    └──────────────┘
```

## 2. Component Breakdown

### A. Jotform API Gateway (`/src/services/jotform/client.ts`)
- Encapsulates all outbound calls to `https://api.jotform.com` or `https://eu-api.jotform.com`.
- Handles EU routing toggle automatically based on configuration.
- Implements Redis TTL cache for form metadata (`GET /form/{formID}/questions`, TTL: 1 hour) to preserve API quota.
- Exposes typed methods: `getForm()`, `getQuestions()`, `getSubmissions()`, `registerWebhook()`, `getWebhooks()`, `deleteWebhook()`, `createForm()`.

### B. Ingestion Controller (`/src/api/webhooks/jotform.ts`)
- Fast, non-blocking webhook receiver endpoint (`POST /api/webhooks/jotform`).
- Validates query tokens or shared secrets (`?secret=...`).
- Performs instant atomic deduplication lock check in Redis (`lock:jotform:sub:{id}`, 5 min TTL) to ignore immediate duplicate webhook bursts.
- Returns `200 OK` within <100ms to avoid Jotform webhook timeout (Jotform times out after 10 seconds).
- Enqueues job to BullMQ queue: `jotform-submissions` with native deduplication by `jobId`.

### C. Normalization & Transformation Pipeline (`/src/services/jotform/normalizer.ts`)
Jotform payloads provide fields in multiple formats:
1. `rawRequest`: JSON string representation of form answers.
2. Flattened field IDs: `q1_name`, `q2_email`, `q3_phoneNumber[area]`, `q3_phoneNumber[phone]`.
The normalizer maps questions into a clean canonical domain schema:
```json
{
  "submissionId": "583920194820192849",
  "formId": "240123456789012",
  "createdAt": "2026-11-24T10:00:00Z",
  "data": {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1-555-0199",
    "files": ["https://www.jotform.com/uploads/.../doc.pdf"]
  }
}
```

### D. Persistence Schema (PostgreSQL via Prisma)
```sql
CREATE TABLE forms (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    schema_cache JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE submissions (
    id VARCHAR(64) PRIMARY KEY,
    form_id VARCHAR(64) NOT NULL REFERENCES forms(id),
    raw_payload JSONB NOT NULL,
    normalized_data JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id VARCHAR(64),
    submission_id VARCHAR(64),
    headers JSONB,
    payload JSONB,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_submissions_form_id ON submissions(form_id);
CREATE INDEX idx_submissions_status ON submissions(status);
```

### E. Downstream Dispatcher (`/src/services/dispatcher/index.ts`)
- Multi-destination event dispatcher.
- Dispatches webhook payloads to configured downstream endpoints (Slack, CRM, custom webhooks, AI processors).
- Retry policy with exponential backoff on downstream failures.
