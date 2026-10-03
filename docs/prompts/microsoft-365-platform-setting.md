Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD
No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or
temporary fallbacks. Every error path handled; no silent failures. Schema changes go through
Prisma migrations that are safe on existing data. Tests cover the new behavior, and the full
suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Do not remove or alter any existing functionality, button,
or section beyond what is asked.

TASK
Send with Microsoft 365 confused testers. Put it behind a platform setting instead of removing
it — it may make sense for Team and Enterprise.

1. A new platform setting controls whether connected Microsoft 365 sending is available to an
   organization. Default is OFF.

2. Only a SUPER_ADMIN can turn it on, from the platform console.

3. It can only be turned on for TEAM and ENTERPRISE organizations. Standard never sees it.

4. When it is off, the organization does not see Send with Microsoft 365, and does not see the
   Microsoft mailbox connection. The Outlook and Gmail handoff paths are unaffected.

5. Keep all the code. This is a switch, not a removal.

REPORT FIRST, BEFORE CHANGING ANYTHING
  a. Where the setting belongs. Trial length and Stripe price IDs live in PlatformSetting as
     global values — this one is per organization, so report whether it belongs on
     OrganizationUsagePolicy, ResearchPolicy, or somewhere else.
  b. Every surface that shows Microsoft 365 sending or mailbox connection today, so all of
     them are gated.
  c. What happens to an organization that already has a connected mailbox when this ships off
     by default. My view: the connection stays in the database and simply is not offered, so
     turning it back on restores it. Confirm that is what you would do.

Do not implement until I approve the report.

TESTS
- A Standard organization never sees Microsoft 365 sending or mailbox connection.
- A Team or Enterprise organization with the setting off does not see them either.
- A SUPER_ADMIN can turn it on for a Team or Enterprise organization, and it then appears.
- A SUPER_ADMIN cannot turn it on for a Standard organization.
- The Outlook and Gmail handoff paths work regardless of the setting.

REPORT
The answers to a, b, and c first. Then what changed and the full-suite result.
