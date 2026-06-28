# CCSP CivicOS Brand Guide

## Brand Identity
CCSP CivicOS is the product brand for Civic Candidate Support Platform.

- Product name: CCSP CivicOS
- Expanded name: Civic Candidate Support Platform
- Positioning: Nonpartisan campaign operations and compliance readiness workspace

## Voice and Messaging
- Tone: Clear, calm, trustworthy, and practical
- Audience language: Candidate- and treasurer-friendly, not developer-centric
- Avoid: Internal engineering terms in user-facing surfaces

Preferred terms:
- Use "workspace" instead of "environment"
- Use "check" or "review" instead of "validate payload"
- Use "recommended next steps" instead of "debug instructions"

## Color System
Primary palette:
- Civic Blue: #0F4C81
- Civic Blue Dark: #0B3C65
- Action Gold: #E0A100
- Action Gold Strong: #B87E00

Neutral palette:
- Ink: #0F172A
- Surface: #F8FAFC
- Surface Soft: #EEF4FB

Usage guidance:
- Primary actions and trust signals use Civic Blue
- Highlights and key calls-to-action use Action Gold
- Body text and labels use Ink and slate neutrals for readability

## Typography
- Display/headlines: Manrope
- Body/UI: Plus Jakarta Sans
- Fallback: Segoe UI, sans-serif

Rules:
- Headings should use display font with tighter tracking
- Body copy and controls should use body font for consistency

## Logo and Icons
- Primary logo file: frontend/public/logo-ccsp-civicos.svg
- Favicon/app icon file: frontend/public/favicon.svg

Rules:
- Keep clear space around logo equal to at least 25% of icon width
- Do not recolor logo elements outside approved palette
- Do not stretch or rotate mark

## Favicon and Browser Metadata
- Browser title: CCSP CivicOS
- Theme color: #0F4C81
- Favicon path: /favicon.svg

## Email Template Style
Transactional and operations emails should follow these rules:
- Header uses Civic Blue background with CCSP CivicOS label
- Primary button uses Action Gold
- Body copy is concise and action-oriented
- Footer includes support contact and nonpartisan product context

Base template:
- docs/email-templates/ccsp-base-email.html

## Accessibility and Contrast
- Maintain minimum WCAG AA contrast in UI and email content
- Avoid low-contrast gold-on-white combinations for body text
- Keep call-to-action labels explicit: "Open checklist", "Review filing issues", "View deadline"
