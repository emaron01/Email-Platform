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
On the Email connection page, add a notice directly above the signature text field. Yellow
background, black bold text, with this content:

  Outlook users — Outlook adds your signature automatically if you have one set there. You do
  not need to enter one below.

  Gmail users — Gmail does not add your signature automatically. Save one below, or add it in
  the Gmail window after clicking Open in Gmail on each message.

Keep the two as separate lines so each is easy to find.

TESTS
- The notice renders above the signature field on the Email connection page.

REPORT
Deploy amd report What changed, which files, and the full-suite result.
