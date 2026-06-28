# Civic Candidate Support Platform (CCSP)

CCSP is an MVP web application that helps first-time political candidates launch and manage campaign compliance workflows.

## MVP Outcomes

1. Candidate account registration and login
2. Office selection and profile setup
3. Personalized campaign checklist generation
4. Campaign finance deadline tracking
5. Treasurer discovery and assignment tracking
6. Secure campaign document storage metadata
7. Donation and expense tracking
8. Automated reminders before filing/report deadlines

## Folder Structure

- `docs/` product and planning docs
- `db/` SQL schema for MVP data model
- `api/` OpenAPI specification for backend contracts

## Suggested Build Order

1. Implement authentication and candidate profile module.
2. Implement office + checklist generator.
3. Implement deadlines + reminders.
4. Implement treasurer module.
5. Implement documents module.
6. Implement donations/expenses ledger and reports.

## Recommended Tech Stack (Improved MVP)

- Frontend: React + Vite + TypeScript
- Styling: Tailwind CSS + Headless UI components
- Backend + Database: Supabase (Postgres, Row Level Security, Edge Functions)
- Authentication: Supabase Auth (email/password + optional OAuth)
- File Storage: Supabase Storage (private buckets for campaign documents)
- Reminders: Supabase scheduled jobs + Edge Functions + Resend
- Hosting: Vercel (recommended) or Netlify
- Code Editor: Visual Studio Code

## Why This Stack

- Faster MVP delivery with fewer services to manage.
- Built-in auth, storage, and database policies reduce security risk.
- Easy deployment for both frontend and serverless backend logic.
- Clear migration path to microservices if usage grows.

## Next Step

Start with [SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) to configure your Supabase project and database.
Then reference [MVP-BACKLOG.md](docs/MVP-BACKLOG.md) and [TECH-STACK.md](docs/TECH-STACK.md) for implementation planning.
