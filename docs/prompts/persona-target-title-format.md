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
Persona synthesis produces poor target title lists.

You reported that likelyTitles is specified only as an array of strings, with no instruction
about format. Nothing tells the model to use formal written forms, to expand abbreviations, or
to avoid bare seniority tokens.

The result on my VP of Sales persona:
  VP Sales, Senior Vice President of Sales, Head of Sales, Regional VP Sales,
  Senior Vice President, Business Development and Sa, VP, Mid-Market Sales & Revenue
  Operations, V.P. of Sales

And on the CRO persona, a stored target of exactly "VP" — a bare seniority token that matched
every VP and SVP title until the matcher was fixed.

Two problems:
  1. No format guidance, so the list mixes abbreviations, one formal line, and bare tokens.
  2. Truncated strings. Two stored targets are cut mid-word: "...Business Development and Sa"
     and the CRO persona's "...Head of Sa".

Report first, before changing anything:
  a. Why the truncation happens — a column length, a prompt instruction, or something in
     parsing. Cite where.
  b. Whether anything validates likelyTitles today.
  c. How many existing personas across my organizations have a bare seniority token or a
     truncated string in their target titles.

Then fix:
  - Instruct synthesis to emit titles as they appear in real contact data: formal written
    forms, each identifying a role rather than a seniority level alone.
  - Reject bare seniority tokens — a target title must name a function, not just a level.
  - Fix the truncation at its source.
  - Validate what synthesis returns, so a bad title list is caught at save rather than
    discovered during scoring.

Do not repair existing personas in this task. Report what a separate repair would involve.

TESTS
- Synthesis output with a bare seniority token is rejected.
- A title longer than whatever caused truncation is stored whole.
- A normal persona build produces a valid title list.

REPORT
The answers to a, b, and c; what changed; what a repair of existing personas would involve;
and the full-suite result.
