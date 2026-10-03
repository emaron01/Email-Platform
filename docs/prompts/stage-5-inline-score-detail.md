# Stage 5 inline score detail

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

On stage 5, the exceptions show a reason and an "Open score detail" link. Clicking it leaves
stage 5, and coming back means rerunning the list. The rep has to leave the flow to find out
why something did not match.

Keep them on stage 5.

1. Replace the "Open score detail" link with a collapsible section on each exception row,
   labelled SHOW SCORE DETAIL.

2. Expanding it shows the detail inline — the same information the score detail page gives for
   that company or contact, so the rep can decide without leaving.

3. The Move to Ready to include and Move to Left out actions stay where they are.

This applies to both "Companies that did not match" and "Contacts that did not match".

## Tests

- Expanding SHOW SCORE DETAIL on a company shows its detail inline without navigating.
- Expanding it on a contact does the same.
- The move actions still work with the section expanded.
- No stage 5 exception links away from the page.

## Report

What changed, what detail is shown inline versus what the score detail page shows, and the
full-suite result.
