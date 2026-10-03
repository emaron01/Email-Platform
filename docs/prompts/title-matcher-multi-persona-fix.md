# Title matcher multi-persona fix

Saved: 2026-10-02

## Scope guard

This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before making changes. Never touch any other repository.

## Production standard

No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or
temporary fallbacks. Every error path handled; no silent failures. Schema changes go through
Prisma migrations that are safe on existing data. Tests cover the new behavior, and the full
suite, typecheck, lint, and production build pass.

## Surgical rule

Change only what is listed below. Do not remove or alter any existing functionality, button,
or section beyond what is asked.

## Task

The title matcher is too generous in both directions, so ordinary sales titles match several
personas at once. On one 55-contact run, 38 contacts (69%) matched more than one persona and
went to the title-suggestion AI call. Historically that figure is 27-37%.

Two rules cause it, per your earlier report:

1. A one-token target matches when it equals the contact title's first token. The CRO persona
   stores a target of exactly "VP", so every title canonicalising to something starting with
   vp matches CRO — every VP and SVP in the list.

2. The reverse-subset rule lets a shorter contact title sit inside a longer target. "Vice
   President of Sales" matches "VP Sales Enablement" and "VP Sales Effectiveness" because
   {vp, sales} is a subset of those. A plain VP of Sales is not a sales enablement leader.

Report first, before changing anything:
  a. What each rule was added for — the case it was meant to catch.
  b. What breaks if the reverse-subset rule is removed, and what breaks if one-token targets
     must match the whole canonical title rather than just the first token.
  c. Re-run matching over a recent scoring run with each proposed change and report the
     multi-persona rate before and after. I want the numbers, not an estimate.

Then fix both so a title matches the persona it actually belongs to. The goal is that "Vice
President of Sales" matches VP of Sales alone.

## Tests

- "Vice President of Sales" matches VP of Sales and not CRO or Sales Enablement.
- "SVP Worldwide Sales" matches VP of Sales alone.
- "Chief Revenue Officer" still matches CRO.
- A genuine sales enablement title still matches Sales Enablement.
- The multi-persona rate on the test fixture drops.

## Report

The answers to a, b, and c; what changed; the multi-persona rate before and after; and the
full-suite result.
