# Email guidance limit and campaign offer on Emails stage

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

1. EMAIL GUIDANCE CHARACTER LIMIT
   Raise the Email guidance limit from 500 to 1500 characters. Update the field, its helper
   text ("up to 500 characters"), any validation, and anywhere else the 500 figure appears.

2. CAMPAIGN OFFER ON THE EMAILS STAGE
   Add the Campaign offer form to the Campaign email settings panel on the Emails stage,
   directly below the Email guidance field.

   It is collapsed by default and expandable.

   It contains the same fields as the Campaign offer section on the Setup stage: Offer Name,
   Primary CTA, Offer Description, Offer Notes, and its Save action.

   Both forms read and write the same campaign offer data. Saving from either page updates
   the other — there is one source of truth, not two copies.

## Tests

- Email guidance accepts 1500 characters and rejects more.
- The offer form on the Emails stage saves and the Setup stage reflects it.
- Saving on Setup and returning to Emails shows the updated values.
- Existing campaigns with saved offers display correctly on both pages.

## Report

What changed, which files, where the 500 limit appeared, how the two offer forms share state,
and the full-suite result.
