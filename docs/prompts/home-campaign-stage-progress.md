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
A tester stopped partway through and could not tell where they were when they came back. Make
Home show that.

1. The platform setup rail at the top stays exactly as it is. It covers the whole workspace,
   not a campaign.

2. Campaigns move below it.

3. Each campaign row shows the campaign stage markers, using the same state as the top rail
   and the side nav inside a campaign — deriveCampaignProgress, so all three agree. Green
   check for done, red circle for the stage they are on.

4. Each marker is clickable and opens that campaign at that stage.

5. Under the markers, a small line: click where you left off to continue.

6. Overdue emails become one collapsible section per campaign, collapsed by default. The
   header is the campaign name and the number of overdue emails.

TESTS
- Each campaign row on Home shows stage markers matching the top rail and side nav.
- Clicking a marker opens that campaign at that stage.
- Overdue emails render as one collapsed section per campaign with the count in the header.
- Expanding a section shows that campaign's overdue emails.

REPORT
What changed, which files, and the full-suite result.
