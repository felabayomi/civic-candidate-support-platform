# CCSP Product Requirements (MVP)

## Product Vision

Enable first-time candidates to stay compliant, organized, and on schedule from declaration to filing.

## Primary User

- New political candidate running for local or state office

## Core User Journey

1. User creates account and confirms email.
2. User creates candidate profile and selects office.
3. System generates personalized checklist and deadlines.
4. User tracks required tasks, documents, and transactions.
5. User assigns a treasurer.
6. User receives reminders before due dates.

## Functional Requirements

### FR1 - Authentication

- User can register with email/password.
- User can log in/out.
- User can reset password.

### FR2 - Candidate Profile & Office Selection

- User can create candidate profile.
- User can select office type, jurisdiction, election date.
- System stores office-specific compliance profile.

### FR3 - Personalized Checklist

- System creates checklist items from office + jurisdiction rules.
- User can mark tasks complete/incomplete.
- System records completion timestamps.

### FR4 - Finance Deadlines

- System stores filing/report deadlines.
- User can view deadlines on list/calendar views.
- System flags overdue deadlines.

### FR5 - Treasurer Assignment

- User can create or invite a treasurer record.
- Candidate can assign one active treasurer.
- System keeps assignment history.

### FR6 - Document Management

- User can upload document metadata (file handling can be integrated in phase 2).
- User can categorize documents (bank statement, filing receipt, invoice, etc.).
- User can tag documents to checklist items.

### FR7 - Donation and Expense Tracking

- User can log donations with source and amount.
- User can log expenses with vendor and purpose.
- System calculates totals and period summaries.

### FR8 - Reminder System

- User receives reminders at configurable offsets (e.g., 14, 7, 1 days before due date).
- System records reminder status (scheduled/sent/failed).

## Non-Functional Requirements

- Secure authentication and role-based access control.
- Auditability for finance and compliance data.
- Basic accessibility and mobile-responsive UX.
- API-first architecture for future mobile app support.

## Out of Scope for MVP

- Payment processing
- Public campaign website builder
- Advanced AI legal/compliance advisory
- Multi-committee financial consolidation
