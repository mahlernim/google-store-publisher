# Google Play setup and boundaries

## CLI setup

Locate the trusted `google-store-publisher` checkout from the workspace's setup records or existing installation. Do not assume its owner, filesystem path or credentials from another workspace. The current CLI is distributed from source. If it is not already built, run `corepack pnpm install --frozen-lockfile` and `corepack pnpm build` from its root. Invoke `node /absolute/path/to/google-store-publisher/packages/cli/dist/index.js --help`. Use this absolute entry point in place of `store-publisher` below, or use an existing linked executable. Do not confuse the publisher checkout with the Android app checkout. Resolve the manifest and bundletool paths absolutely.

Reuse existing credentials. Missing API credentials or HTTP 403 do not establish a release conflict or the precise cause of an access failure. Do not print credential files or automatically grant account access. An authorized release can continue through the [Console fallback](console-fallback.md) when its conditions are met.

The current shared CLI's mutation commands support existing testing tracks, one AAB per release, and full rollout. This is a client boundary, not a Google API restriction. Production destinations, staged rollout and listing updates need the routing in [production and listings](production-and-listings.md). Check the actual installed version before assuming that a capability has been added.

Reuse the supported authentication method, including existing keyless Application Default Credentials where configured. Determine the permissions needed by the actual operation. Testing-release permission does not imply production or store-presence permission. Do not replace authentication or expand grants merely because another client is available. Install Java, jarsigner, keytool, and an independently verified pinned bundletool release when validating a fresh AAB.

Start with a reviewed release manifest containing the package, testing track, version name, version code, AAB path and SHA-256, upload-certificate SHA-256, configuration SHA-256, and localized release notes.

For a fresh release, the sequence is below. A status-only request needs only status. When resuming a journal, continue at its verified phase rather than inspecting or uploading again.

1. `store-publisher play status`
2. `store-publisher play inspect --execute`
3. `store-publisher play plan`
4. `store-publisher play upload --execute`
5. `store-publisher play validate --execute`
6. `store-publisher play submit --execute`
7. `store-publisher play wait`

Keep the manifest and `.play-state` directory unchanged between mutation steps. Upload and validation do not submit the release. Submit is the only commit.

Status and wait are read-only. Inspect creates and deletes a temporary edit and can invalidate an older edit owned by the same identity. Do not run it while an existing edit or journal is active. Serialize operations for the app, including Console work. Share one absolute state directory across stateful commands and preserve it across CI runs. Local locks do not coordinate separate machines. Inspect covers Google Groups, not individual email tester lists.

`--state-dir` is accepted by `inspect`, `upload`, `validate`, `submit`, and the three `promote-prepare`, `promote-validate`, `promote-submit` commands. Omit it for `status`, `wait`, `plan`, and `promote-plan`. For example, use `play status --package com.example.app --track alpha --version-code 42` without a state directory. Check the installed CLI help when versions differ.

Use the publisher checkout's `examples/google-play.release.json` for field names and `providers/google-play/README.md` for detailed commands. Obtain the configuration fingerprint from a reviewed inspection. Use the expected upload certificate, not the app-signing certificate. Verify an existing immutable release artifact rather than rebuilding merely to answer a status request.

Where the workspace already has a release pipeline, reuse its verified immutable artifact and source revision. A direct CI handoff can avoid workstation transfers, but must retain package/version/signature/digest checks and journal persistence. Do not move or duplicate builds just to accommodate the publishing interface. Record build, upload and provider-wait durations separately when investigating slowness. A CLI does not bypass bundle processing or review. Write local manifests and evidence with explicit UTF-8 where platform defaults differ.

An uncertain upload or commit requires manual API and Console reconciliation. Do not retry automatically, remove the journal, or remove a stale lock without verifying the process and remote edit state.

For a journal left at `committing`, first confirm that its worker is no longer active. Reconcile the existing edit where readable, the exact intended version and every changed release/listing field against remote evidence. A matching version in review alone does not prove that all metadata changes committed. Record the resolution separately while preserving the original journal. Use a documented client recovery operation to finalize local state or release its lock only after the operation and ownership are resolved. The current shared CLI has no recovery command. If that gap prevents local finalization, report it and retain the evidence rather than hand-editing phases or deleting state to force another run. A confirmed remote submission must not be repeated because local recovery is incomplete.

Commit success is not approval or tester availability. Preserve and report native lifecycle states. Verify actual tester availability separately when required.

Wait reports the PUBLISHED lifecycle, which can also describe a halted release. Approved but unpublished may still require managed publishing. Neither state proves a tester can install the release.

Official documentation:

- https://developers.google.com/android-publisher/edits
- https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit
- https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases
