# Campaign progress one source

Saved: 2026-10-03

## Scope guard

This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote before making changes. Never touch any other repository.

## Production standard

No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or
temporary fallbacks. Every error path handled; no silent failures. Tests cover the new
behavior, and the full suite, typecheck, lint, and production build pass.

## Surgical rule

Change only what is listed below. Do not remove or alter any existing functionality, button,
or section beyond what is asked.

## Task

A tester stopped partway through a campaign and could not tell where they were. Make campaign
progress visible and consistent everywhere.

1. ONE SOURCE, THREE PLACES
   The top rail, the side nav inside a campaign, and the Home page campaign rows all read the
   same stage state from buildCampaignStages. They must never disagree.

   Home is a later task — build the shared source now so Home can use it.

2. SIDE NAV INSIDE A CAMPAIGN
   When a rep is inside a campaign, the side nav shows the campaign stages in rail order, with
   the same state as the top rail. Green check for done, red circle for the stage they are on.

3. RESUME WHERE THEY LEFT OFF
   Opening a campaign lands on the first incomplete stage, as it does today.

4. EMAILS IS EXECUTION, NOT SETUP
   Setup stages complete once and stay complete. Emails is different — it reflects whether the
   rep is caught up, and it flips back and forth for the life of the campaign.

   Emails is GREEN when no contact on the campaign has an email due.
   Emails is RED when any contact has an email due.

   "Due" is CampaignContact.nextDueAt in the past, with no sequenceStoppedAt, on a contact
   that is not excluded — the same rule getDueContactsForUser already uses.

   A campaign with no drafts yet is RED: emails are the work and none has been done.

   This changes the top rail, which currently turns Emails green as soon as any draft exists,
   sent or not. That is wrong and should change.

   Report what this does to the resume point. A rep returning to a live campaign with emails
   due should land on Emails, not Report.

## Tests

- The side nav inside a campaign shows stages with the same state as the top rail.
- Opening a campaign lands on the first incomplete stage.
- Emails is red when a contact has an email due.
- Emails is green when no contact has an email due.
- Emails is red on a campaign with no drafts.
- A campaign whose contacts have all finished their sequences shows Emails green.

## Report

What changed, what the Emails rule change does to existing campaigns and to the resume point,
and the full-suite result.
