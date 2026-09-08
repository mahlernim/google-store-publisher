---
name: playstore-publisher
description: Inspect Google Play release status and publish Android AABs to existing testing tracks through the google-store-publisher CLI. Use for Play Store uploads, validation, review submission and release reconciliation, not Chrome extensions or production rollouts.
---

# Play Store Publisher

Prefer the shared repository CLI over handwritten provider API calls. Read [setup and recovery boundaries](references/setup.md) before Play operations. Verify the CLI help matches the intended command. If existing API access is unavailable, read the [Console fallback](references/console-fallback.md) before continuing through an existing signed-in session.

## Choose the requested operation

- For status questions, use `play status` with the exact package, track and version where known. Do not build, create edits or submit changes.
- For an already-uploaded version, use the [promotion workflow](references/promotion.md). Do not reupload, rebuild or increment its version code. Production may be read as a source, never used as a destination.
- For a fresh authorized testing release, verify app-repository instructions, target, release artifact provenance and embedded version. Review configuration with `play inspect --execute` only when no existing edit or journal is active, then prepare the exact release manifest.
- Run offline `play plan` with that manifest and bundletool before `play upload --execute`, `play validate --execute` and `play submit --execute`. Preserve the same manifest and absolute state directory throughout. Only submit commits.
- For an interrupted workflow, inspect its journal and remote status first. Continue only from a confirmed uploaded or validated phase. Do not restart the fresh-release sequence.

## Boundaries

Only existing testing tracks with one AAB and full rollout are supported. Do not route production releases, staged rollouts, tester changes or country changes through these commands. Explain the limit and ask for direction if the request requires another operation.

Execute mutations only within the user's authorized app, track and release scope. An end-to-end release authorization includes its scoped submission and does not need repetitive confirmation. Account access changes or a different target require new direction. Never expose credentials.

Stop on identity, certificate, version, configuration or review conflicts. Never retry an uncertain upload, validation or commit automatically. Preserve the journal and lock evidence and reconcile the saved edit or Console before changing local state.

Report upload, validation, submission, review, approval and publication separately, retaining native lifecycle states. If Console shows “Changes in review” while quick checks are running, report submission requested, pending quick checks. Do not equate that heading, commit success or wait completion with review started or tester availability.
