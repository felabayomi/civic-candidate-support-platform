# CCSP Pilot UAT Script

Audience:

- 5 to 10 first-time candidates
- 1 treasurer
- 1 advisor or organization support user

Session length:

- 45 to 60 minutes each

Facilitator rule:

- Observe and ask neutral questions. Do not coach unless user is blocked for more than 2 minutes.

## Setup

- [ ] Test accounts prepared by role (candidate, treasurer, advisor/admin).
- [ ] Test data reset or isolated per participant.
- [ ] Screen recording and note template ready.
- [ ] Facilitator has issue log template open.

## Candidate Task Flow

1. Account creation and login
- Task: Create account, confirm email guidance comprehension, sign in.
- Success criteria:
  - User reaches welcome page without facilitator intervention.
  - User can explain what to do if confirmation email is in spam/junk.
- Observe:
  - Points of confusion during signup language.
  - Time to complete.

2. Complete campaign launch wizard
- Task: Enter campaign basics and progress through steps.
- Success criteria:
  - User completes all required steps.
  - Progress is retained on refresh/session return.
- Observe:
  - Which steps are unclear.
  - Where users hesitate or abandon.

3. Dashboard and checklist understanding
- Task: Open dashboard, interpret health score, open checklist.
- Success criteria:
  - User identifies at least one required next action.
  - User can navigate to compliance checklist without help.
- Observe:
  - Whether score language is understandable.
  - Navigation comprehension.

4. Finance workflow
- Task: Add one donation and one expense.
- Success criteria:
  - Both records save successfully.
  - User can explain where to edit or review entries.
- Observe:
  - Data-entry friction.
  - Error clarity.

5. Reporting and filing validation
- Task: Open reports and run filing validation.
- Success criteria:
  - Validation completes.
  - User can explain blocking vs warning outcomes.
- Observe:
  - Trust in validation results.
  - Misinterpretations of legal/compliance disclaimers.

6. Document workflow
- Task: Upload one document and confirm it appears in list.
- Success criteria:
  - Upload succeeds.
  - User can find document later in session.
- Observe:
  - Naming conventions used by users.
  - Confidence in storage/retrieval.

## Treasurer Task Flow

1. Review marketplace and requests
- Task: Access treasurer area and inspect candidate requests.
- Success criteria:
  - Treasurer can locate pending requests.
  - Treasurer can accept or decline correctly.
- Observe:
  - Clarity of request status labels.

2. Assignment understanding
- Task: Confirm assignment appears where expected.
- Success criteria:
  - Assignment status is visible and understandable.
- Observe:
  - Role boundary confusion.

## Advisor/Admin Task Flow

1. Access control check
- Task: Confirm only admin role can open admin console.
- Success criteria:
  - Non-admin denied.
  - Admin allowed.
- Observe:
  - Any route leakage or navigation confusion.

2. Compliance rule management sanity check
- Task: Review existing rule set and validation metrics.
- Success criteria:
  - Read-only review and safe edits behave as expected.
  - No hard-delete behavior for historical compliance artifacts.
- Observe:
  - Whether admin controls are understandable for owner/founder workflows.

## Quantitative Success Thresholds

- [ ] >= 80 percent of candidate participants complete core flow without facilitator help.
- [ ] Median time for candidate core flow <= 35 minutes.
- [ ] Critical failure rate (blocked task) <= 10 percent.
- [ ] Admin-console access leakage incidents = 0.

## Observation Sheet Template

For each participant, capture:

- Participant ID:
- Role:
- Date/time:
- Device/browser:
- Completed tasks (Y/N per task):
- Time per task:
- Blockers encountered:
- Quotes that indicate confusion or trust concerns:
- Severity tags:
  - P0: security/access control
  - P1: workflow blocker
  - P2: major usability pain
  - P3: minor UX polish
- Recommendation:
- Follow-up owner:

## Exit Questions

Ask at the end:

1. What felt easiest?
2. What felt confusing or risky?
3. At what point would you have asked for outside help?
4. Would you trust this for early campaign operations?
5. What one change would make this launch-ready for you?
