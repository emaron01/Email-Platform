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

1. STAGE 5 — DROP THE COMPANIES SECTION
   Remove "Companies that did not match" entirely. A company has no qualification of its own;
   that section was a rollup of contact buckets and showed contact problems as company
   problems.

   Stage 5 shows only contacts that did not match.

2. STAGE 5 — CONTACT ROWS
   Each row shows the contact name, their title underneath, and the real reason from the score
   detail. Replace the generic "Qualification is incomplete" with that reasoning — if the ICP
   failed, say which criterion; if the title did not match, say so.

   Keep the collapsible SHOW SCORE DETAIL and the move actions as they are.

3. AFTER APPROVE, STAGES 6 AND 7 ARE DONE
   Stage 5 does the work of Companies and Contacts. When stage 5 is approved, those stages
   count as complete and the rep lands on Emails. They remain reachable for anyone who wants
   the detail.

4. COMPANIES STAGE (6)
   Add a button on each company row that opens the full company research profile. That page
   already exists. Nothing else on that stage changes.

5. CONTACTS STAGE (7)
   Show each contact's title under their name.

   Add a persona dropdown on each row so the rep can change which persona that contact's email
   is generated against. This sets the persona for email generation only — it does not rescore
   the contact.

   Report how this relates to the existing persona override and resolveContactPersonaDecision
   before implementing that part.

TESTS
- Stage 5 shows no companies section.
- Stage 5 contact rows show title and the real reason, not the generic line.
- Approving stage 5 marks stages 6 and 7 complete and lands the rep on Emails.
- Stages 6 and 7 are still reachable.
- The company research button opens the profile.
- Changing a contact's persona on stage 7 changes which persona their email uses and does not
  rescore them.

REPORT
What changed, how the persona dropdown relates to the existing override, and the full-suite
result.
