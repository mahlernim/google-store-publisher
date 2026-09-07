---
name: store-publisher
description: Safely inspect and manage Google store releases through the google-store-publisher CLI. Use for existing Chrome Web Store extension releases and guarded Google Play testing-track releases, including artifact validation, status, upload, submission, cancellation, waiting, and rollout where supported.
---

# Store Publisher

Use the repository CLI as the source of truth. Do not recreate provider API calls in the skill.

## Before acting

- Inspect repository instructions, working-tree state, release commit, manifest version, package command, and relevant CI.
- Confirm `store-publisher --help` works. Read the matching provider reference for installation, authentication, and API boundaries.
- Treat package creation, validation, upload, submission, approval, staged availability, rollout, and public publication as separate states.
- Never print tokens, authorization headers, service-account keys, OAuth secrets, or credential files.

## Chrome Web Store workflow

1. Build and test with the extension repository's own commands.
2. Run `store-publisher chrome validate` with the exact package and expected version.
3. Run `store-publisher chrome status` and reconcile warnings, takedowns, or an active submission.
4. Run the intended mutation without `--execute` and show the dry-run result.
5. Proceed with `--execute` only when the user authorized that exact mutation and target.
6. Reconcile the returned provider-native and normalized states. Never report submission as publication.

Use `submit` when the user wants upload plus review submission. It re-uploads the verified artifact immediately before submission. Warning blocking remains enabled unless the user explicitly accepts the warnings. Use staged or skip-review options only when explicitly requested.

Stop on a version mismatch, moved release commit, conflicting submission, warning, takedown, rejection, unexpected target, or incomplete asynchronous upload.

## Google Play workflow

Read `references/google-play.md` before Google Play work. Use only existing testing tracks with one AAB and full rollout. Run `play plan` before upload, then preserve the exact manifest and `.play-state` journal through upload, validate, and submit. Only submit commits the edit.

Do not use this CLI for production, staged rollout, tester changes, or country changes. Never automatically retry an uncertain mutation or discard a journal or lock before reconciliation.
