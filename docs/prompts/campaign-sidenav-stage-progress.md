# Campaign side nav stage progress

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

A tester stopped partway through a campaign, came back, and could not tell where they were.
Make the side nav inside a campaign mirror the top progress tracker, so there is no doubt
where they are or where they have been.

## Required

1. When a rep is inside a campaign, the side nav shows the campaign stages in the same order
   as the top stage rail.
2. Each stage shows a green check when it is done, and a red circle for the stage they are
   currently on — the first incomplete one.
3. Clicking a campaign from anywhere opens it at the first stage that is not done, so they
   resume where they left off.
4. The Emails stage is green when the last email in the current sequence is marked sent. It
   turns red when emails are due and not sent.

## Report first, before changing anything

a. What decides a stage is complete today — the top rail already computes this, so confirm
   the side nav can use the same source.
b. How the Emails stage state would be determined, given rule 4. Confirm what "the last
   email in the current sequence is marked sent" means against the existing data, and what
   "due and not sent" reads from.
c. Whether the side nav currently changes at all when inside a campaign, or whether it is
   the same workspace nav everywhere.

Do not implement until I approve the report.

## Tests

- The side nav inside a campaign shows the stages with the correct state.
- Opening a campaign lands on the first incomplete stage.
- The Emails stage is green when the current sequence is sent, red when emails are due.

## Report

The answers to a, b, and c first. Then what changed and the full-suite result.
