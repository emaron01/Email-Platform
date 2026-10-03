# Campaign stage 5 automate list

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

Implement the stage 5 automation you reported on. Reuse the existing actions — this is
chaining what a rep does by hand today, not new behavior.

### The flow

1. Selecting a list is the only action on stage 5.

2. Selecting a list starts the work automatically:
   - researchCompaniesForContactListAction, unless it returns NOTHING_TO_DO
   - poll getResearchRunStatusAction as the research panel does
   - when research is done, createScoringRunAction then scoreContactsAction

3. While it runs, stage 5 shows a spinner and a message that list preparation is underway. No
   live counts.

4. When it finishes, stage 5 shows the exceptions inline — companies that did not match and
   contacts that did not match, with reasons, using the same labels and the same override
   actions available today.

5. Approve attaches the Ready to include contacts and opens stage 6, exactly as Save and
   return to campaign does now.

### Failures — same as today, nothing new

Research failing before a run exists, ending FAILED or CANCELLED, stalling, or coming back
PARTIAL with companies still unresearched: stop, end the spinner, and show the rep what
happened with the retry that already exists. Do not continue into scoring, and do not spin.
Scoring failing: end the spinner and show the message the action returns.

### Hide, do not delete

Hide the Search existing contacts path. Report how you hid it and how I restore it.

Remove the Add from Scored Run dropdown and both Jump to scored runs banners from stage 5.

### Confirm

Standalone list research and scoring outside a campaign is unaffected.

## Tests

- Selecting a list starts research and scoring with no further clicks.
- A list whose companies are all researched skips to scoring.
- Exceptions render inline with the same reasons and override actions as today.
- Approve attaches Ready to include contacts and opens stage 6.
- Research failing, stalling, or ending PARTIAL stops the spinner and shows the rep what
  happened.
- Scoring failing stops the spinner and shows the message.
- Standalone list research and scoring still works.

## Report

What changed, how the hidden path is restored, and the full-suite result.
