# Google Play setup and boundaries

## CLI setup

Reuse a trusted clone of `https://github.com/mahlernim/google-store-publisher`. The CLI is not yet a published package. From its root run `corepack pnpm install --frozen-lockfile` and `corepack pnpm build`. Invoke `node /absolute/path/to/google-store-publisher/packages/cli/dist/index.js --help`. Use this absolute entry point in place of `store-publisher` below, or link it with `npm link` from `packages/cli`. Do not confuse the publisher checkout with the Android app checkout. Resolve the manifest and bundletool paths absolutely.

Reuse existing credentials. Missing API credentials or HTTP 403 do not establish a release conflict or the precise cause of an access failure. Do not print credential files or automatically grant account access. An authorized release can continue through the [Console fallback](console-fallback.md) when its conditions are met.

Google Play support is limited to existing testing tracks, one AAB per release, and full rollout. Production and staged rollout are unsupported.

Use Google Application Default Credentials with app-scoped testing-release access. Install Java, jarsigner, keytool, and an independently verified pinned bundletool release.

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

An uncertain upload or commit requires manual API and Console reconciliation. Do not retry automatically, remove the journal, or remove a stale lock without verifying the process and remote edit state.

Commit success is not approval or tester availability. Preserve and report native lifecycle states. Verify actual tester availability separately when required.

Wait reports the PUBLISHED lifecycle, which can also describe a halted release. Approved but unpublished may still require managed publishing. Neither state proves a tester can install the release.

Official documentation:

- https://developers.google.com/android-publisher/edits
- https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit
- https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases
