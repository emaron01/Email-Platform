# Exclusion checker seniority strip

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

The exclusion checker wrongly excludes real targets.

You reported: "After the checker strips one leading seniority word, 'vice president sales'
becomes sales. Any TITLE_TESTABLE criterion whose name, description, or research guidance
contains 'sales' then confirms."

That is why Chris Albery, "Vice President - Sales" at HITRUST — a genuine VP of Sales — was
excluded from the VP of Sales persona as an "Individual-contributor-only role", and also
confirmed against the CRO exclusion, and also excluded from the CRO, Revenue Operations, and
Sales Enablement personas.

A Vice President of Sales is not an individual contributor. The stripping rule turns a
seniority-bearing title into a bare function word and then matches any criterion mentioning
that function.

Fix the exclusion checker so a title's seniority is not discarded before exclusion matching.

Report first, before changing anything:
  a. Why the leading seniority word is stripped — what case it was added for.
  b. What the checker compares against: criterion name, description, research guidance, or all
     three. Matching an exclusion on words found in research guidance looks wrong on its face.
  c. How many contacts across recent scoring runs were excluded by a criterion that only
     confirmed because of this stripping. I want the scale before deciding the fix.

Then fix it. The fix must not break genuine exclusions — an actual individual contributor
should still be excluded.

## Tests

- "Vice President - Sales" is not excluded as an individual-contributor role.
- "Vice President of Sales" is not excluded by the CRO exclusion on the VP of Sales persona.
- A genuine individual contributor title is still excluded.
- Chris Albery's title matches VP of Sales and is not excluded.

## Report

The answers to a, b, and c; what changed; the before and after for the titles above; and the
full-suite result.
