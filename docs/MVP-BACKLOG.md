# CCSP MVP Backlog

## Sprint 0 - Foundation

- Set up repo, CI, and environment templates.
- Create Supabase project and apply schema from `db/schema.sql`.
- Configure Supabase Auth and role policies (RLS).
- Configure Supabase Storage buckets for private documents.
- Define API contracts from `api/openapi.yaml` and map to Edge Functions.

## Sprint 1 - Candidate Onboarding

- Registration, login, reset password.
- Candidate profile CRUD.
- Office selection + jurisdiction fields.
- Initial dashboard with onboarding progress.

## Sprint 2 - Compliance Workflow

- Checklist template engine by office/jurisdiction.
- Candidate checklist instances.
- Deadline service and overdue highlighting.
- Reminder scheduler using Supabase cron + Edge Functions.

## Sprint 3 - Treasurer + Documents

- Treasurer create/invite/assign flow.
- Assignment timeline/history.
- Document metadata upload + categorization.
- Link documents to checklist tasks.

## Sprint 4 - Finance Tracking

- Donations CRUD.
- Expenses CRUD.
- Summary dashboard totals.
- Export-ready report view (CSV for MVP).

## Exit Criteria for MVP

- A candidate can complete full onboarding.
- A candidate can see and manage deadlines.
- A candidate can assign a treasurer.
- A candidate can log donations/expenses.
- Reminder jobs run and log status.
