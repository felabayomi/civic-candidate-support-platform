# CCSP Supabase Setup Guide

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or log in.
2. Click **"New Project"** in your Supabase dashboard.
3. Fill in:
   - **Name**: `civic-candidate-support-platform`
   - **Database Password**: Choose a strong password
   - **Region**: Select the region closest to your users
4. Click **"Create new project"** and wait for it to initialize (2-3 minutes).

## Step 2: Get Your Credentials

1. After the project is created, go to **Settings** > **API**.
2. Copy the following values:
   - **Project URL** → paste into `VITE_SUPABASE_URL`
   - **Anon Key** (public, safe to expose) → paste into `VITE_SUPABASE_ANON_KEY`
3. Paste these into the frontend `.env.local` file at:
   ```
   c:\FelixPlatform\Civic Candidate Support Platform (CCSP)\frontend\.env.local
   ```

## Step 3: Create Database Tables

1. In your Supabase project, go to **SQL Editor** (in the left sidebar).
2. Click **"New Query"**.
3. Open the file: [db/supabase-schema.sql](../../db/supabase-schema.sql)
4. Copy the entire SQL content.
5. Paste it into the Supabase SQL Editor.
6. Click **"Run"** to execute the schema.

The schema creates:
- **users** — candidate profiles linked to auth
- **candidates** — campaign profile (office, jurisdiction, election date)
- **campaigns** — campaign instance
- **treasurers** — treasurer registry
- **treasurer_assignments** — candidate ↔ treasurer mapping
- **checklist_items** — candidate tasks and compliance items
- **donations** — incoming contributions
- **expenses** — outgoing campaign spending
- **reports** — filing reports and their status
- **documents** — stored documents and metadata
- **deadlines** — filing and reporting deadlines

Plus indexes and **Row Level Security** policies so each candidate sees only their own data.

## Step 4: Configure Frontend Environment

1. Open `frontend/.env.local`:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...your_key...
   ```
2. Save the file.
3. Restart your frontend dev server (or rebuild):
   ```bash
   npm run dev
   ```

## Step 5: Test the Login Flow

1. Start the frontend:
   ```bash
   cd frontend && npm run dev
   ```
2. Navigate to `http://localhost:5173/login` (or the port shown in terminal).
3. Click **"Sign up"** and create a test account with:
   - Email: `test@example.com`
   - Password: `TestPassword123` (min 6 chars)
4. Check your email for a confirmation link (or check Supabase dashboard for auth logs).
5. After confirming, sign in and you should be redirected to `/dashboard`.

## Step 6: Test Protected Routes

1. Try accessing a protected route directly (e.g., `/dashboard`).
2. You should be redirected to `/login` if you're not authenticated.
3. Sign in, and the protected routes should now be accessible.

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` is in the `frontend/` folder.
- Double-check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct.
- Restart the dev server after adding env vars.

### "Auth not working"
- Verify the Supabase project is initialized and tables exist.
- Check the Supabase **Auth** > **Users** tab to see if your account was created.
- Ensure the SQL schema was fully applied (run it again if needed).

### "Confirmation email not received"
- Check the email spam folder.
- In Supabase, go to **Authentication** > **Providers** > **Email** and verify settings.
- For testing, you can disable email confirmation in **Auth** settings.

## Next Steps

After confirming auth works:
1. Wire each page component to real database queries (queries will use `supabase` client from `lib/supabaseClient.ts`).
2. Populate initial checklist templates by office/jurisdiction.
3. Add Supabase Edge Functions for scheduled reminders.
4. Deploy frontend to Vercel or Netlify.
5. Set up backend if needed for complex business logic or external integrations.
