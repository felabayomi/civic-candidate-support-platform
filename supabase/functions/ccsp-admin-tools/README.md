# CCSP Admin Tools Edge Function

Function name: `ccsp-admin-tools`

## Purpose

Admin-only utility actions for compliance assistant operations.

Currently supported actions:

- `clear_cache` (state-wide or state + specific question)

## Deploy

```bash
supabase functions deploy ccsp-admin-tools
```

## Request body

```json
{
  "action": "clear_cache",
  "stateCode": "MD",
  "question": "what are the matchup for governor in maryland for 2026"
}
```

`question` is optional. If omitted, cache is cleared for the entire state.
