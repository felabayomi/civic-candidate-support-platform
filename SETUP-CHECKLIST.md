# CCSP Supabase Setup Checklist

Complete these steps in order to get your CCSP frontend fully functional with Supabase auth and database.

## Phase 1: Supabase Project Setup ✅ Do This First

### Step 1.1 - Create Supabase Project
- [ ] Go to https://supabase.com and sign up or log in
- [ ] Click **"New Project"** button
- [ ] Fill in project details:
  - Name: `civic-candidate-support-platform` (or any name you prefer)
  - Database Password: Choose a strong password (save it somewhere safe)
  - Region: Pick the closest to your location
- [ ] Click **"Create new project"**
- [ ] Wait 2-3 minutes for initialization to complete

### Step 1.2 - Get Your Credentials
- [ ] Once project is ready, go to **Settings** (bottom-left sidebar)
- [ ] Click **"API"** tab
- [ ] Copy these two values:
  - **Project URL** (looks like: `https://xxxxxxxxxxxx.supabase.co`)
    - Paste this as: `VITE_SUPABASE_URL`
  - **Anon Key** (looks like: `eyJ...`)
    - Paste this as: `VITE_SUPABASE_ANON_KEY`
- [ ] Keep these handy for the next step

---

## Phase 2: Database Schema Setup ✅ Do This Second

### Step 2.1 - Open SQL Editor
- [ ] In your Supabase project dashboard, find **SQL Editor** in the left sidebar
- [ ] Click **"New Query"** button
- [ ] A blank SQL editor will open

### Step 2.2 - Copy and Run Schema
- [ ] Open this file in VS Code:
  ```
  c:\FelixPlatform\Civic Candidate Support Platform (CCSP)\db\supabase-schema.sql
  ```
- [ ] Select **ALL** the SQL code (Ctrl+A)
- [ ] Copy it (Ctrl+C)
- [ ] Paste it into the Supabase SQL Editor (Ctrl+V)
- [ ] Click the blue **"Run"** button in the top-right
- [ ] Wait for completion (should see green success message)
- [ ] Verify tables were created by going to **Table Editor** in the sidebar
  - You should see: users, candidates, campaigns, treasurers, checklist_items, donations, expenses, reports, documents, deadlines

---

## Phase 3: Frontend Credentials ✅ Do This Third

### Step 3.1 - Add Credentials to .env.local
- [ ] Open this file in VS Code:
  ```
  c:\FelixPlatform\Civic Candidate Support Platform (CCSP)\frontend\.env.local
  ```
- [ ] Replace the empty values with your credentials:
  ```
  VITE_SUPABASE_URL=https://your-project-id.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
  ```
- [ ] Save the file (Ctrl+S)
- [ ] **Important**: Do NOT commit .env.local to Git (it should be in .gitignore)

### Step 3.2 - Restart Frontend Dev Server
- [ ] Open PowerShell and navigate to the frontend folder:
  ```powershell
  Set-Location "c:\FelixPlatform\Civic Candidate Support Platform (CCSP)\frontend"
  ```
- [ ] Kill any existing dev server (Ctrl+C if running)
- [ ] Start the dev server:
  ```powershell
  npm run dev
  ```
- [ ] You should see output like:
  ```
  VITE v8.1.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Press q to quit
  ```
- [ ] Copy the Local URL (usually http://localhost:5173)

---

## Phase 4: Test Login Flow ✅ Do This Fourth

### Step 4.1 - Access Login Page
- [ ] Open your browser
- [ ] Go to: `http://localhost:5173/login` (or the URL from npm run dev)
- [ ] You should see the login form

### Step 4.2 - Create Test Account (Sign Up)
- [ ] Click **"Sign up"** link at the bottom
- [ ] Fill in:
  - **Email**: `test@example.com` (or any email)
  - **Password**: `TestPassword123` (must be 6+ characters)
- [ ] Click **"Create Account"** button
- [ ] You should see: **"Check your email to confirm your account!"**

### Step 4.3 - Confirm Email (Supabase Magic Link)
- [ ] Go to your Supabase dashboard
- [ ] Click **"Authentication"** → **"Users"** in the sidebar
- [ ] You should see your test@example.com user created
- [ ] In development, you can confirm without email:
  - Go to **Settings** → **Auth**
  - Scroll to **Email Auth**
  - Toggle **"Confirm email"** OFF (for dev only!)
  - This allows instant signup/signin without email confirmation

### Step 4.4 - Sign In
- [ ] Go back to `http://localhost:5173/login`
- [ ] Click **"Sign in"** (if not already showing login form)
- [ ] Enter:
  - **Email**: `test@example.com`
  - **Password**: `TestPassword123`
- [ ] Click **"Sign In"** button
- [ ] ✅ **SUCCESS**: You should be redirected to `/dashboard`
- [ ] If redirected to dashboard, you're fully authenticated!

---

## Phase 5: Wire Pages to Database ✅ Do This Fifth

### Step 5.1 - Test Protected Routes
- [ ] While logged in, try accessing:
  - http://localhost:5173/dashboard ✅ (should show)
  - http://localhost:5173/candidate-profile ✅ (should show)
  - http://localhost:5173/compliance-checklist ✅ (should show)
- [ ] Log out (this requires a logout button; we'll add one):
  - Open browser console and run: `localStorage.clear()`
  - Refresh the page
- [ ] Try accessing `/dashboard` while logged out
- [ ] ✅ **SUCCESS**: Should redirect to `/login`

### Step 5.2 - Wire CandidateProfile Page
Start with the simplest page to wire to the database. I'll implement:
- Form to create/update candidate profile
- Real-time save to Supabase
- Load existing profile on page load

This requires:
1. Creating a hook `useCandidateProfile()` that queries Supabase
2. Updating [CandidateProfile.tsx](../../frontend/src/pages/CandidateProfile.tsx) to use it
3. Adding form inputs and save logic

Tell me when you're ready, and I can implement this.

### Step 5.3 - Wire Dashboard
After CandidateProfile, we'll add:
- Load candidate's checklist items
- Show deadline cards with due dates
- Display donation/expense totals

### Step 5.4 - Wire Donations/Expenses Pages
- Add form to create donations and expenses
- List existing transactions
- Calculate period totals

---

## Troubleshooting

### Error: "Missing Supabase environment variables"
**Solution**: 
- Check `.env.local` exists and has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Ensure there are NO spaces around the `=` sign
- Restart the dev server after updating `.env.local`

### Error: "Auth not working / Can't sign up"
**Solution**:
- Check Supabase **Authentication** → **Providers** → **Email** is enabled
- Verify the SQL schema was fully applied (check **Table Editor** for all tables)
- Try disabling email confirmation (Settings → Auth → "Confirm email" OFF for dev)

### Can't see confirmation email
**Solution** (for development):
- Supabase doesn't send real emails in development by default
- Go to **Settings** → **Auth** → **Email Auth**
- Toggle **"Confirm email"** to OFF
- Now sign-ups are instant

### Frontend won't start
**Solution**:
- Kill the dev server (Ctrl+C)
- Delete `node_modules` folder: `Remove-Item -Recurse node_modules`
- Reinstall: `npm install`
- Restart: `npm run dev`

---

## Success Indicators

✅ **You're done when:**
1. Supabase project is created and accessible
2. All 11 tables appear in Supabase Table Editor
3. Frontend starts without errors
4. You can sign up and sign in at http://localhost:5173/login
5. Dashboard shows after login
6. Accessing `/dashboard` while logged out redirects to `/login`

🎉 **Next**: Tell me when Phase 4 (login test) is complete, and I'll implement database wiring for pages!
