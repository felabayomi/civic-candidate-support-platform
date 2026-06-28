# CCSP Recommended Tech Stack

## Final MVP Stack

- Frontend: React + Vite + TypeScript
- Styling: Tailwind CSS
- Backend/Database: Supabase (Postgres + Row Level Security + Edge Functions)
- Authentication: Supabase Auth
- Document Storage: Supabase Storage
- Background Jobs: Supabase scheduled jobs + Edge Functions
- Notifications: Resend email API
- Hosting: Vercel or Netlify
- Development Environment: Visual Studio Code

## Suggested Architecture

- Browser client (React/Vite) talks directly to Supabase for auth and database.
- Security is enforced with Row Level Security policies.
- Custom business rules (reminder dispatch, report calculations) run in Edge Functions.
- Scheduled jobs trigger reminder Edge Functions daily.

## Improvement Notes Over Typical MVP Stacks

- Avoids standing up and maintaining a separate custom backend early.
- Reduces auth and file-storage implementation complexity.
- Keeps costs low while still supporting growth.
- Allows selective migration later if heavy backend logic is needed.

## Initial Package Recommendations

### Frontend

- react
- react-dom
- react-router-dom
- @supabase/supabase-js
- tailwindcss
- @tanstack/react-query
- zod
- react-hook-form

### Optional Utilities

- dayjs (date handling)
- recharts (finance dashboards)

## Minimal Environment Variables

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server-side only)
- RESEND_API_KEY

## Deployment Guidance

- Vercel: best fit if using React SPA plus optional serverless handlers.
- Netlify: good alternative with similar workflow.
- Supabase: managed database/auth/storage and scheduled jobs.
