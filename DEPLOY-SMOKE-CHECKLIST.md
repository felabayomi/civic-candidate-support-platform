# CCSP Deploy Smoke Checklist

Use this checklist before production deploy and again immediately after deploy.

## Critical Path

- [ ] Candidate signs up and can complete login.
- [ ] Candidate creates profile and campaign.
- [ ] Campaign row has state_code populated.
- [ ] Campaign Launch Wizard loads and saves progress.
- [ ] Filing Validation runs without errors.
- [ ] A blocking issue prevents filing/export when expected.
- [ ] Resolving the issue clears the block and allows export.
- [ ] Validation run record is persisted.
- [ ] Validation result rows are persisted.
- [ ] Audit event is persisted.

## Rule-Set Resolution Checks

- [ ] Baseline rule sets exist after fresh schema run.
- [ ] Maryland rule set exists and is active.
- [ ] campaign_active_rule_sets returns a row for an MD campaign.
- [ ] If no rule set resolves, UI shows controlled warning (non-fatal).
- [ ] Rule set name/version used are captured in validation context/audit metadata.

## Admin Guardrails

- [ ] Invalid condition JSON is blocked in Admin Console.
- [ ] Unsupported condition type is blocked.
- [ ] required_field missing table/field is blocked.
- [ ] minimum_count missing numeric minimum is blocked.
- [ ] max_amount missing numeric max is blocked.
- [ ] Rule delete action deactivates instead of hard-delete.
- [ ] Rule set delete action archives instead of hard-delete.
- [ ] DB blocks deletion of rules/rule sets with validation history.

## Data and Audit Verification

- [ ] compliance_validation_runs row created for each run.
- [ ] compliance_validation_results rows created per evaluated rule.
- [ ] blocking_count, warning_count, info_count are accurate.
- [ ] audit_events row created with run metadata.

## Post-Deploy Notes

- [ ] Capture Vite chunk warning as Phase 6 performance item.
- [ ] Verify report/export disclaimer copy is visible: workflow support, not final legal clearance.
