# Persona criteria review groups

Saved: 2026-10-03

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

On the persona criteria review, two changes.

1. The remove control on an exclusion is barely visible. Make it red and clearly visible.
   Sort the criteria list so inclusions are grouped together and exclusions are grouped
   together, with a clear heading for each.
2. Add a notice at the top of the persona edit view, in a yellow box with bold black text:
   READ CAREFULLY AND APPROVE ALL INCLUSIONS AND EXCLUSIONS FOR MAXIMUM ACCURACY

## Tests

- Inclusions and exclusions render in separate groups with headings.
- The remove control on an exclusion is rendered in red.
- The notice renders at the top of the persona edit view.

## Report

What changed, which files, and the full-suite result.
