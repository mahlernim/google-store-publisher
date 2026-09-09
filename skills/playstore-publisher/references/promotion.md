# Existing-bundle promotion

Use these current CLI commands to put an exact existing AAB version on one or more existing testing tracks at full rollout. They do not need bundletool or a new upload. The source can be production, but these commands reject production destinations. For an authorized production destination, follow [production and listings](production-and-listings.md), retaining exact-version reuse.

Before mutation, confirm the app, source, version code, trusted bundle SHA-256 and destination tracks. Reuse the immutable release's digest, not an invented placeholder. Read lifecycle status for production, source and destinations. An in-review, approved-unpublished, rejected, draft or unknown state requires reconciliation first. Read-only credentials can check status but cannot prepare an edit. Additional permissions require separate authorization.

Use the publisher repository's `examples/google-play.promotion.json` schema. These are separate commands from new-bundle upload:

```shell
store-publisher play promote-plan --manifest promotion.json
store-publisher play promote-prepare --manifest promotion.json --execute
store-publisher play promote-validate --manifest promotion.json --execute
store-publisher play promote-submit --manifest promotion.json --execute
```

Replace `store-publisher` with the absolute built CLI entry from setup. Use the same absolute `--state-dir` for all three mutation commands. Plan is offline schema/intent validation, not proof of permission, remote identity or release readiness.

Prepare creates an edit and saves a journal, verifies the bundle digest and exact source version, and returns baseline/desired track data without changing tracks. Review that output before validate. Validate stages all destinations in that one edit. Submit is the only promotion command that commits, with ERROR_IF_IN_REVIEW. Never remove that guard to bypass a review conflict.

Source name, localized notes and update priority are copied. Destination release-level country targeting is retained. No tester or country-availability endpoint is written. Existing same/newer destination versions, staged/multiple destination releases, ambiguous source versions and unsupported release fields stop the operation.

The CLI checks standard/source/destination lifecycle states before creating the edit, then discovers and checks every track inside it. A custom-track conflict can therefore leave a creating journal and uncommitted edit. Do not run prepare over an existing Console draft or app journal. Serialize Console and API work.

Only prepared and validated journals can advance. Creating, validating or committing after interruption requires manual reconciliation, not automatic retry or journal removal. The shared app lock/journal also prevents overlap with the new-upload workflow. Keep journal output private because it contains release data.

Submit saves committed state before reading production/source/destination status. If those reads fail, do not resubmit. Query status independently. Report submission, review and publication separately. PUBLISHED can include halted releases and does not independently prove installability.

Distinguish command-contract and mocked tests from live publishing evidence. Consult current private operational records before claiming that this mode has been live-tested for the selected account and client version. Record new live outcomes there, not in this reusable procedure.
