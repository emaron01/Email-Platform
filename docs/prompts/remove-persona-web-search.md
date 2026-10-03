# Remove persona web search

Saved: 2026-10-02

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

Remove persona web search entirely. Personas are synthesised from the approved product
profile and the model's own knowledge of the buyer role. No web search, no page fetching, no
web evidence.

Reason: the search sends "Product name: {role} {product}" as an identity line and asks for
official product pages for something that is not a product. It returns vendor marketing and
job listings — one persona stored four Salesforce job requisitions, two duplicate forecasting
guides, and a Japanese careers page. Six of eight sources were never cited in the draft. The
buyer role is general knowledge; the product profile is what makes the persona specific.

## Remove

- The persona search call and its focus-string construction.
- The source discovery, fetching, and storage path used only by persona search.
- personaWebEvidence as an input to persona synthesis.
- The synthesis instruction that web-evidence claims may only come from those excerpts, and
  anything else in the prompt that refers to web evidence for personas.
- The "Built from your approved product profile, and N web sources" line and the source list
  on the persona view.
- The gap-detection logic that decides whether to search, including the well-known-title skip.
- PERSONA_WEB_SEARCH usage recording, if it exists only for this path.
- Any persona search configuration — max searches, max sources, and related settings.

## Do not remove

- Anything shared with company research or product research. Report what is shared and confirm
  those paths are untouched.
- Existing stored persona sources in the database — leave the rows alone. Report what happens
  to personas that already have them.

## Confirm

- Persona synthesis still receives the approved product profile and peer personas for
  differentiation.
- Persona criteria projection, title suggestions, and scoring are unaffected.

## Tests

- Building a persona makes no web search and no page fetches.
- Synthesis produces a complete persona from the product profile alone.
- Peer differentiation still works — building a second persona for a product that already has
  one produces distinct pain points.
- The persona view renders without the web sources line.
- Existing personas with stored sources still display correctly.

## Report

What was removed, what was shared and left alone, what happens to existing stored sources,
what persona synthesis now receives, the cost per persona before and after, and the full-suite
result.
