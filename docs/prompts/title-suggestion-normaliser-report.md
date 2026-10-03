# Title suggestion normaliser report

Saved: 2026-10-02

## Scope guard

This task runs ONLY in the Email-Platform repository (Aimed Outreach). Confirm the repository
and remote. This is a report only — change no code.

## Task

Roughly twenty title suggestions on one run proposed VP of Sales, with sound reasoning, for
titles that should have matched directly:

  Chief Experience Officer and VP of Sales
  Executive Vice President, Head of Sales
  Senior Vice President, DOD and Federal Sales
  SVP of North American Sales
  SVP Worldwide Sales
  Vice President of Commercial Sales
  Vice President of Sales- Community Banking

The VP of Sales persona's targetTitles are:
  VP Sales, Senior Vice President of Sales, Head of Sales, Regional VP Sales,
  Senior Vice President Business Development and Sales, VP Mid-Market Sales & Revenue
  Operations, V.P. of Sales

"Vice President of Sales" — the most common written form — is not in that list. The titles
stored are the spoken abbreviations, not the formal forms that appear in real contact data.

Report:
  a. What the normaliser produces for each title above and for each stored target title, and
     exactly where each comparison fails.
  b. Whether this is primarily a normalisation gap or a persona-synthesis problem — synthesis
     generating colloquial titles rather than the formal ones found in lists.
  c. What persona synthesis is instructed to produce for targetTitles, and whether it is told
     to use formal written forms.
  d. Two contacts were also left out: Chris Albery, "Vice President - Sales" at HITRUST, and
     Chris Novak, "President & Chief Revenue Officer" at PMWEB. Both excluded under a CRO
     exclusion on the VP of Sales persona. Both are wrong for my market — Albery is a VP of
     Sales, and Novak owns the number personally at a smaller company. Report which persona
     holds that exclusion and what it was derived from.
  e. What proportion of a typical list currently needs the second AI call to resolve titles.

## Report

The answers above. No code changes.
