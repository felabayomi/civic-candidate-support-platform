# CCSP Compliance Chat Edge Function

Function name: `ccsp-compliance-chat`

## Purpose

Provides live model responses for the CCSP AI Compliance Assistant with state-aware context, citation enforcement, and legal disclaimer behavior.

## Required secrets

Set in Supabase project secrets for **CCSP project only**:

- `OPENAI_API_KEY`

Do **not** reuse keys from unrelated projects unless you explicitly intend to share billing/auditing scope.

## Deploy

```bash
supabase functions deploy ccsp-compliance-chat
```

## Local test (example)

```bash
supabase functions serve ccsp-compliance-chat --env-file .env.local
```

## Request body

```json
{
  "question": "What should I do if I discover a contribution reporting error?",
  "stateCode": "MD",
  "stateName": "Maryland",
  "citations": [
    { "label": "Maryland Campaign Finance", "url": "https://elections.maryland.gov/campaign_finance/index.html" }
  ],
  "history": [
    { "role": "user", "content": "How do I correct a filing?" },
    { "role": "assistant", "content": "..." }
  ],
  "enforceMarylandBlock": true
}
```

## Response body

```json
{
  "answer": "...",
  "citations": [
    { "label": "...", "url": "..." }
  ],
  "stateCode": "MD",
  "stateName": "Maryland"
}
```
