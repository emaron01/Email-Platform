Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD
No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or
temporary fallbacks. Every error path handled; no silent failures. Tests cover the new
behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Do not remove or alter any existing functionality, button,
or section beyond what is asked.

TASK
Repair the two personas in Erik's Workspace whose target titles contain a bare "VP" and
comma-split fragments: Chief Revenue Officer, and Vice president of Sales.

You reported the drafts already contain the completed wording, and that manuallyEditedFields
includes targetTitles so re-synthesis will not overwrite them.

Write the draft titles onto targetTitles for those two personas, dropping the bare "VP" and
the fragments. Report the before and after for each.

Do this as a one-time operation I can run, not as an automatic migration.

TESTS
- Neither persona has a bare seniority token or a stub after the repair.
- Scoring against those personas produces the expected matches.

REPORT
Before and after for both personas, how I run it, and the full-suite result.
