# Netlify Environment Checklist (CCSP)

Use this checklist before creating a production or pilot site in Netlify.

## Build Settings

- [ ] Repository root points to project root.
- [ ] Build command uses `npm --prefix frontend ci && npm --prefix frontend run build`.
- [ ] Publish directory is `frontend/dist`.
- [ ] Node version is set to 20.
- [ ] SPA redirect is active (`/* -> /index.html`).

## Required Frontend Environment Variables

Set these in Netlify Site Configuration -> Environment Variables:

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`

Rules:

- [ ] Do not place service role keys in Netlify frontend env vars.
- [ ] Do not place SMTP, Resend, or other privileged backend secrets in frontend env vars.
- [ ] Confirm env vars are set for both Production and Deploy Preview contexts as needed.

## Admin/Owner-Only Controls

- [ ] Admin Console route remains role-restricted in app routing (`allowedRoles: ['admin']`).
- [ ] Founder/owner email accounts are explicitly seeded as admin in DB bootstrap policy.
- [ ] No non-admin users have `profiles.role = 'admin'` in production.
- [ ] Test as non-admin: visiting `/admin-console` shows unauthorized screen.
- [ ] Test as admin owner/founder: `/admin-console` loads successfully.

## Pre-Deploy Verification

- [ ] `npm --prefix frontend run build` passes locally.
- [ ] `npm --prefix frontend run test` passes locally.
- [ ] Legal routes are reachable: `/privacy`, `/terms`, `/accessibility`, `/cookies`, `/legal-disclaimer`.
- [ ] Pilot banner visible on landing and login pages.

## Post-Deploy Smoke Checks

- [ ] Candidate signup/login works in deployed site.
- [ ] Core wizard-to-dashboard flow works without console errors.
- [ ] Treasurer, volunteer, and documents pages load for valid roles.
- [ ] Filing validation writes expected records in Supabase.
- [ ] Admin Console is inaccessible to non-admin accounts.
