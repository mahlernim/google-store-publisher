---
name: chrome-webstore-publisher
description: Inspect and publish existing Chrome Web Store extension releases through the google-store-publisher CLI. Use for extension ZIP validation, upload, review submission, cancellation and percentage rollout, not Android Google Play releases.
---

# Chrome Web Store Publisher

Use the shared repository CLI, not handwritten API calls. Read [CLI setup and authentication](references/setup.md) before Chrome operations. Confirm CLI help supports the intended command.

## Choose the requested operation

- For status questions, use `chrome status` or `chrome inspect` with the exact publisher and item. Do not build or mutate.
- For an authorized release, inspect extension-repository instructions and use its verified release ZIP or build with its own packaging commands when needed. Run `chrome validate --artifact <absolute-zip> --version <expected-version>` and query status before mutation.
- Run the intended mutation without `--execute` to inspect its plan. The dry run is local planning, not remote acceptance or review validation. Execute only within the authorized target and operation.
- Use `chrome submit` for upload plus review submission. It uploads the verified ZIP again before publishing, so do not routinely run upload followed by submit. Use standalone upload only when uploading a draft is the requested outcome.
- Cancellation and percentage rollout are separate requested operations. Specify the expected version. Do not use them to resolve a conflicting submission without authorization.

Keep warning blocking enabled unless the user explicitly accepts the warnings. Staged publishing and skip-review options require explicit user intent. Existing policy warnings or takedowns may require dashboard resolution even when publish warnings were accepted.

## Uncertain outcomes

Stop after a timeout, connection failure, incomplete asynchronous upload or failed post-submit reconciliation. A command error, including a timeout labeled uncertain=false, does not prove no mutation occurred. Do not rerun submit or upload blindly.

Query status for the same item and reconcile asynchronous upload state and submitted/published versions. If status cannot establish which artifact was accepted, use the Developer Dashboard and preserve the artifact digest and operation evidence. Do not cancel a submission or upload another package just to clear uncertainty. Resume only after the actual state and remaining authorized action are established.

## Reporting and limits

Stop on target/version conflicts, active submissions, rejection, policy holds or changed release provenance. Retain provider-native states and distinguish uploaded, submitted, approved, staged and publicly published. Respect existing end-to-end authorization without repetitive confirmation, but do not infer permission for a new account change or different target. Never print credentials.

Initial item creation, listing content, privacy declarations and unsupported policy settings remain dashboard operations. Explain these limits rather than inventing CLI capabilities.
