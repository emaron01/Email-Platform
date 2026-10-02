# Email guidance 2000 and prompt example

Saved: 2026-10-02

## Scope guard

This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before making changes. Never touch any other repository.

## Production standard

No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or
temporary fallbacks. Every error path handled; no silent failures. Tests cover the new
behavior, and the full suite, typecheck, lint, and production build pass.

## Surgical rule

Change only what is listed below. Do not remove or alter any existing functionality, button,
or section beyond what is asked.

## Task

1. Raise EMAIL_GUIDANCE_MAX_CHARS from 1500 to 2000. Update the constant, helper text,
   textarea maxLength, form parsing, server validation, and the test assertion — the same
   places the previous change touched.

2. Add a new example to the Prompt examples list on both the campaign Email guidance field
   and the per-draft regeneration field:

   Do not use the following words or their variations: sample, free, cost.

## Tests

- Email guidance accepts 2000 characters and rejects more.
- The new example appears in the Prompt examples list on both fields.

## Report

What changed, which files, and the full-suite result.
