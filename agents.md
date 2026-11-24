# MULTI-AGENT SPECIFICATION FOR JOTFORM AUTOMATION

## Agent 1: Form Provisioning & Architect Agent (`form_architect`)
- **Role:** Programmatic creation, templating, and management of Jotform forms.
- **Trigger:** CLI command, administrative API call, or schema update.
- **Responsibilities:**
  1. Inspect requested domain model (e.g. "Customer Intake Form").
  2. Generate Jotform Question JSON structures matching field types (`control_head`, `control_textbox`, `control_email`, `control_phone`, `control_fileupload`).
  3. POST to `https://api.jotform.com/user/forms` or `/form/{formID}/questions`.
  4. Automatically configure the webhook URL on the newly created form.
  5. Cache form metadata in Redis/Database.

## Agent 2: Webhook Sentinel & Ingestion Agent (`webhook_sentinel`)
- **Role:** First line of defense for incoming HTTP webhook hits from Jotform.
- **Responsibilities:**
  1. Parse `multipart/form-data` or `application/x-www-form-urlencoded`.
  2. Validate query token `?secret=...`.
  3. Extract `submissionID` and `formID`.
  4. Perform atomic deduplication check in Redis (`SET submission:lock:{id} EX 300 NX`).
  5. Enqueue submission event to BullMQ.
  6. Return immediate HTTP 200 to prevent Jotform re-attempts.

## Agent 3: Transformer & Normalization Agent (`submission_transformer`)
- **Role:** Worker that resolves raw Jotform answer structures into clean, typed JSON.
- **Responsibilities:**
  1. Dequeue job from `jotform-submission-queue`.
  2. Fetch question mapping from Redis/DB cache for the corresponding `formID`.
  3. Parse compound fields (names with first/last, address lines, date pickers, matrix tables).
  4. Download or verify file attachments if `control_fileupload` exists.
  5. Validate data against domain Pydantic/Zod schemas.
  6. Write normalized record to PostgreSQL table `submissions`.

## Agent 4: Dispatcher & Workflow Action Agent (`workflow_dispatcher`)
- **Role:** Route verified, normalized submissions to downstream destinations.
- **Responsibilities:**
  1. Route based on form ID or submission criteria (e.g. high-priority lead vs support ticket).
  2. Trigger downstream targets:
     - CRM sync (HubSpot / Salesforce / PostgreSQL)
     - Real-time notification (Slack webhook / Discord / Email)
     - AI Enrichment (run LLM analysis, summary, or sentiment classification)
  3. Update submission processing state in DB (`PROCESSED` or `FAILED`).
