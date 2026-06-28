# Lint Triage for Pilot Release

Current lint snapshot:

- 39 errors
- 10 warnings

Primary pattern:

- New React hook rule `react-hooks/set-state-in-effect` flags many existing effects that call state setters or loader methods.

## Must-Fix Before Pilot

These are fix-now because they impact reliability, access confidence, or signal unresolved defect handling:

1. Authentication redirect side effects
- File: `frontend/src/pages/Login.tsx`
- Reason: login redirect state toggling in effect is part of critical auth flow.

2. Admin Console data-load effect hygiene
- File: `frontend/src/pages/AdminConsole.tsx`
- Reason: admin owner/founder operational screen should not carry avoidable effect warnings around data loading dependencies.

3. Unused error variables in user-facing critical flows
- Files:
  - `frontend/src/pages/Login.tsx`
  - `frontend/src/pages/FilingValidation.tsx`
  - `frontend/src/pages/Reports.tsx`
  - `frontend/src/pages/Documents.tsx`
- Reason: often indicates swallowed errors or incomplete handling.

4. Any lint issue introduced by new pilot/support work
- Files:
  - `frontend/src/components/SupportDialog.tsx`
  - `frontend/src/components/Navbar.tsx`
- Reason: keep latest release edits clean and auditable.

## Post-Pilot Backlog (Planned Refactor)

These are broad structural refactors and can be scheduled after pilot if runtime behavior is stable:

1. Systematic effect refactor for data-loading pages
- Files include:
  - `frontend/src/pages/CampaignLaunchWizard.tsx`
  - `frontend/src/pages/AIComplianceAssistant.tsx`
  - `frontend/src/pages/Donations.tsx`
  - `frontend/src/pages/Expenses.tsx`
  - `frontend/src/pages/ComplianceChecklist.tsx`
  - `frontend/src/pages/Treasurer.tsx`
  - `frontend/src/pages/TreasurerAssignments.tsx`
  - `frontend/src/pages/TreasurerMarketplace.tsx`
  - `frontend/src/pages/VolunteerMatching.tsx`
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/CandidateProfile.tsx`
  - `frontend/src/pages/Welcome.tsx`

2. Type hardening in compliance evaluator
- File: `frontend/src/lib/complianceEvaluator.ts`
- Issue: `@typescript-eslint/no-explicit-any` findings.

3. Fast refresh export hygiene
- File: `frontend/src/lib/authContext.tsx`
- Issue: `react-refresh/only-export-components`.

## Pilot Policy

- Build and tests must pass for pilot deploy.
- Must-fix lint issues above should be cleared or explicitly waived with owner sign-off.
- Post-pilot backlog can remain open if no security or role leakage risk is present.

## Admin-Only Scope Guardrail

- Keep admin console route restricted to `allowedRoles: ['admin']`.
- Treat any non-admin access path to `/admin-console` as P0 and block release.
