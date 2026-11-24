# TOOL & SKILL SCHEMAS (MCP / FUNCTION CALLING)

These tools are consumed by Codex or autonomous agents to interact with Jotform:

### 1. `jotform_get_form_schema`
Retrieves question definitions and metadata for a specific form.
```json
{
  "name": "jotform_get_form_schema",
  "description": "Fetch question elements, field types, and labels for a Jotform form.",
  "parameters": {
    "type": "object",
    "properties": {
      "form_id": {
        "type": "string",
        "description": "The unique Jotform form ID (e.g., '240123456789012')"
      }
    },
    "required": ["form_id"]
  }
}
```

### 2. `jotform_register_webhook`
Registers an endpoint URL to receive real-time submission events for a form.
```json
{
  "name": "jotform_register_webhook",
  "description": "Adds a webhook URL to a Jotform form to trigger on submission.",
  "parameters": {
    "type": "object",
    "properties": {
      "form_id": {
        "type": "string",
        "description": "Jotform Form ID"
      },
      "webhook_url": {
        "type": "string",
        "format": "uri",
        "description": "Public HTTPS callback URL"
      }
    },
    "required": ["form_id", "webhook_url"]
  }
}
```

### 3. `jotform_fetch_submissions`
Queries submissions with pagination and date filters.
```json
{
  "name": "jotform_fetch_submissions",
  "description": "Fetches submissions for a given form with limit, offset, and order filters.",
  "parameters": {
    "type": "object",
    "properties": {
      "form_id": { "type": "string" },
      "limit": { "type": "integer", "default": 20, "maximum": 100 },
      "offset": { "type": "integer", "default": 0 },
      "orderby": { "type": "string", "enum": ["created_at", "updated_at"], "default": "created_at" }
    },
    "required": ["form_id"]
  }
}
```

### 4. `jotform_create_form`
Programmatically generates a new form on Jotform with specified fields.
```json
{
  "name": "jotform_create_form",
  "description": "Creates a new Jotform form with title and structured question elements.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "questions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["control_textbox", "control_email", "control_textarea", "control_dropdown", "control_fileupload"] },
            "text": { "type": "string", "description": "Field label/question text" },
            "order": { "type": "integer" },
            "required": { "type": "boolean", "default": false }
          },
          "required": ["type", "text", "order"]
        }
      }
    },
    "required": ["title", "questions"]
  }
}
```
