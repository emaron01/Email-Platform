# Campaign stage 5 single list flow

Saved: 2026-10-03

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

Stage 5 (List) on a campaign has too many paths and testers cannot follow it. Replace it with
one flow.

### Current state

Stage 5 offers: Select an Existing List To Be Researched and Scored, Add from Scored Run with
a scoring run dropdown, Search existing contacts with an Add selected contacts button, and two
"Jump to scored runs" banners.

### New flow

1. The only action is selecting a list.

2. Selecting a list starts the work automatically, exactly as if the rep had run it by hand:
   - Company research for every company on the list that does not already have fresh research.
     If every company is already researched, skip straight to scoring.
   - Contact scoring once research completes.

3. While that runs, stage 5 shows a spinner and a message that list preparation is underway.
   No live counts.

4. When it finishes, stage 5 shows the exceptions inline:
   - The companies that did not match, with the reason.
   - The contacts that did not match, with the reason.
   The rep fixes or accepts them in place, using the same actions available today on the
   company and score reports.

5. The rep clicks Approve. The qualified contacts attach to the campaign and they move to
   stage 6.

### Hide, do not delete

Hide the Search existing contacts path rather than removing it. It may come back. Report how
you hid it and how I would restore it.

Remove the Add from Scored Run dropdown and both "Jump to scored runs" banners from stage 5 —
selecting a list now does that work.

## Report first, before changing anything

  a. What currently triggers company research and scoring when a rep does it by hand, and
     whether those paths can be called in sequence from stage 5.
  b. How stage 5 would know the work is finished — the existing ResearchRun and ScoringRun
     status, or something new.
  c. What happens if research or scoring fails partway. The rep must not be stuck on a
     spinner.
  d. What "did not match" means for companies and for contacts in the existing data, and which
     existing actions let a rep fix or accept them.
  e. Whether standalone list research and scoring outside a campaign still works after this —
     it must.

Do not implement until I approve the report.

## Tests

- Selecting a list on stage 5 starts research and scoring without further clicks.
- A list whose companies are all researched skips to scoring.
- Exceptions render inline after the work finishes.
- Approve attaches the qualified contacts and moves to stage 6.
- A failure during research or scoring surfaces to the rep rather than spinning forever.
- Standalone list research and scoring outside a campaign is unaffected.

## Report

The answers to a through e first. Then what changed, how the hidden path is restored, and the
full-suite result.
