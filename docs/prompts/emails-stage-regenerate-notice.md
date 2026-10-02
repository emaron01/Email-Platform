# Emails stage regenerate notice

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

On the Emails stage, in the Campaign email settings panel, add a notice in a yellow box with
black text reading:

  You need to regenerate any emails that have been created before the change was saved.

## Tests

- The notice renders in the Campaign email settings panel on the Emails stage.

## Report

What changed, which files, and the full-suite result.
