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
1. HIDE "All org campaigns" ON STANDARD. A Standard account is one seat, so there are no other
   campaigns to see. Keep it for Team and Enterprise, with the existing role behavior.
2. EDIT GOES TO SETUP. Rename the action to "Edit campaign / offer details" and open the
   campaign setup stage, not the resumed stage. Clicking the card itself still resumes.
3. FIX THE EMAILS MARKER. A campaign with drafts and nothing sent currently shows Emails green,
   because nextDueAt is only written after a send, so nothing is due. That is wrong — Report
   then refuses to open, saying to send at least one email first.
   Emails is GREEN only when at least one email has been sent and no contact is due.
   Emails is RED when any contact is due, or when nothing has been sent yet.
   This applies everywhere the marker renders: Home, the Campaigns page, the campaign rail, and
   the side nav.

TESTS
- Standard does not see All org campaigns. Team and Enterprise do.
- Edit opens the setup stage and is labelled "Edit campaign / offer details".
- A campaign with drafts and no sends shows Emails red.
- A campaign with sends and nothing due shows Emails green.
- A campaign with a contact due shows Emails red.
- All four surfaces agree.

REPORT
What changed, which files, and the full-suite result.
