# CCSP Deadline Reminder Engine

Function name: `ccsp-deadline-reminders`

## Purpose

Sends deadline reminder emails for candidate campaigns using Resend.

Supports:

- Admin-triggered runs from the app (JWT + admin check)
- Scheduled cron runs (header `x-cron-secret`)

## Required secrets

- `RESEND_API_KEY`
- `REMINDER_FROM_EMAIL`
- `CRON_SECRET` (recommended for scheduled jobs)

## Deploy

```bash
supabase functions deploy ccsp-deadline-reminders --no-verify-jwt
```

## Request body

```json
{
  "dryRun": true,
  "triggeredBy": "admin-console"
}
```

## Suggested schedule

Run once daily, for example:

- `0 13 * * *` (13:00 UTC)

Configure scheduler to call:

`https://<project-ref>.functions.supabase.co/ccsp-deadline-reminders`

with headers including:

- `Content-Type: application/json`
- `x-cron-secret: <CRON_SECRET>`
