---
name: playstore-publisher
description: Inspect and publish Google Play Android releases and localized store listings. Prefer supported CLI workflows, with a reconciled Console fallback for production, metadata or other operations the installed client cannot perform. Use for uploads, promotions, review submission and release reconciliation, not Chrome extensions.
---

# Play Store Publisher

Prefer a supported, verified CLI workflow over browser navigation or handwritten API calls. Read [setup and recovery boundaries](references/setup.md) and check the installed client's help before execution. Distinguish provider capabilities, implemented client capabilities and the current account's permissions. Successful status reads do not prove publishing access.

## Choose the requested operation

- For status questions, use `play status` with the exact package, track and version where known. Do not build, create edits or submit changes.
- For an already-uploaded version, reuse that exact bundle. The current CLI's [promotion workflow](references/promotion.md) handles testing destinations. Do not rebuild, reupload or increment its version code merely to promote it.
- For a fresh testing release supported by the current CLI, follow [setup](references/setup.md), using one manifest and state directory through plan, upload, validation and submission.
- For production, staged rollout or localized store text, read [production and listings](references/production-and-listings.md). Google supports these operations through its API, but the current shared CLI does not implement all of them. Do not invent commands or remove client safeguards to claim support.
- When the client or API access cannot handle the authorized operation, use the [Console fallback](references/console-fallback.md), respecting an explicit CLI-only request. Explain the capability gap without requesting permission again for an already-authorized release.
- For an interrupted workflow, inspect its journal and remote status first. Resume only from a confirmed phase supported by that command's workflow. Do not restart the fresh-release sequence.

## Boundaries

Execute mutations only within the authorized app, track, rollout and metadata scope. An end-to-end release authorization includes its scoped submission and does not need repetitive confirmation. Ask only for missing material decisions, genuinely new authorization or required user interaction. Do not infer permission to change account access, signing, testers or countries.

Stop on identity, certificate, version, configuration or review conflicts. Never retry an uncertain upload, validation or commit automatically. Preserve the journal and lock evidence and reconcile the saved edit or Console before changing local state.

Report upload, validation, submission, review, approval and publication separately, retaining native lifecycle states. If Console shows “Changes in review” while quick checks are running, report submission requested, pending quick checks. Do not equate that heading, commit success or wait completion with review started or tester availability.

## Reusable guidance and private records

Keep this skill about procedures and verified tool contracts. Keep package/account identifiers, artifact paths and hashes, locale selections, branding decisions, browser preferences, release history, credentials setup records and live-test outcomes in the workspace's private operational records. Use a verified Git-excluded local folder or an external private directory, not public repository documentation. Do not turn one workspace's choices into defaults for other apps.
