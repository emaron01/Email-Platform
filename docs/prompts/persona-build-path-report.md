# Persona build path report

Saved: 2026-09-27

## Scope guard

This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before reading anything. Never touch any other repository. This is a report only —
change no code.

## Task

Report exactly how personas are built today, start to finish.

## Required

1. Every AI call in the persona path, in order. For each: which role and model, what it
   receives, what it returns, and roughly how many tokens.
2. What the "suggested roles" stage produces — is it a separate call, or a byproduct of
   product synthesis? What does it collect and store?
3. What happens when I click to build a persona. Which calls run, and what is the minimum
   information collected before anything is written.
4. What runs at approval versus before it.
5. Whether any of it runs more than once — re-synthesis, reinterpretation, projection — and
   what triggers each.
6. Actual cost per persona from UsageEvent for a recent build, not an estimate. Report the
   operations, tokens, and estimated cost.

## Report

The call sequence, what each stage collects, and the measured cost. No code changes.
