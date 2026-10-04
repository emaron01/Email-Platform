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
The Campaigns page is a plain table while Home shows rich campaign cards. They should look the
same and carry the same data. The Campaigns page is the focused view — same cards, without the
rest of Home.

1. Replace the table on the Campaigns page with the same campaign cards Home uses, reading the
   same data from the same source.

2. Add two fields to the card, on both Home and Campaigns: the product, and the date created.

3. The Campaigns page keeps everything else it has — My Campaigns and All org campaigns tabs,
   Show archived campaigns, New campaign, and the Edit action on each campaign.

TESTS
- The Campaigns page renders campaign cards matching Home.
- Both show product and date created.
- The tabs, archived toggle, New campaign, and Edit still work.

REPORT
What changed, which files, and the full-suite result.
