# Google Play provider

The implementation supports existing testing tracks with one AAB per release and full rollout. Production and staged-rollout management are unsupported. Chrome Web Store support and the shared skill are implemented separately in this repository. MCP remains follow-up work.

## Setup

Build with Node 22 or newer using `corepack pnpm install` and `corepack pnpm build`. Install a JDK with java, jarsigner and keytool. Obtain and independently verify a pinned bundletool release.

Enable the Android Publisher API and grant the identity access only to the intended app and testing-release operations in Play Console. Authentication uses Google Application Default Credentials through google-auth-library. Prefer workload identity federation in CI. Keep local credentials outside the repository. These commands do not configure credentials.

Use a dedicated publisher identity and serialize operations for the app, including Console work. Creating a new edit invalidates the same user's existing edit. Console changes can invalidate edits too. Local locks do not coordinate different machines.

## Workflow

Run from the repository root, replacing example identifiers and paths.

```shell
node packages/cli/dist/index.js play status --package com.example.app --track alpha
node packages/cli/dist/index.js play inspect --package com.example.app --track alpha --execute
node packages/cli/dist/index.js play plan --manifest release.json --bundletool /tools/bundletool.jar
node packages/cli/dist/index.js play upload --manifest release.json --bundletool /tools/bundletool.jar --execute
node packages/cli/dist/index.js play validate --manifest release.json --execute
node packages/cli/dist/index.js play submit --manifest release.json --execute
node packages/cli/dist/index.js play wait --package com.example.app --track alpha --version-code 42 --timeout 300
```

Start with the [manifest example](../../examples/google-play.release.json). Artifact paths are relative to the manifest. Set expectedConfigurationSha256 from the reviewed inspect output. Supply the upload certificate fingerprint, not the Play app-signing certificate. SHA-256 values are lowercase hexadecimal without separators. Version codes are strings.

Use an immutable, independently verified release AAB. Plan verifies its digest, embedded package/version, full JAR signature and upload certificate. Upload repeats verification on the bytes to upload. Multiple PEM certificates are conservatively rejected pending explicit certificate-chain support.

Status and wait only read lifecycle summaries. Inspect creates and deletes a temporary edit, so requires explicit execution. Its configuration fingerprint covers Google Groups and country settings. Individual email tester lists are not exposed by this API. The provider never writes tester or country configuration.

Upload creates an edit and uploads the bundle without changing the track. Validate checks the baseline, stages the release and localized notes, preserves existing release country targeting, and validates the edit. Submit is the only commit. It uses ERROR_IF_IN_REVIEW and checks all tracks returned by the edit for pending, rejected, draft or unknown release states.

Commit success is not approval or tester availability. Native lifecycle states are retained. Approved-but-not-published may require managed publishing action. Wait succeeds on the PUBLISHED lifecycle, which can also describe a halted release, not a verified tester installation. Verify actual availability separately when required. Timeout exits 3 and other failures exit 1.

## Existing-version promotion

Use `examples/google-play.promotion.json` for an exact existing version and bundle SHA-256, a source track, and one or more existing testing destinations. Run `play promote-plan`, `play promote-prepare --execute`, `play promote-validate --execute`, then `play promote-submit --execute`, each with `--manifest promotion.json`. Mutations share the existing app lock and journal in `--state-dir`. Review prepare's baseline and desired output before validation. Production sources are allowed, production destinations are not. No artifact upload occurs.

See [promotion guidance](../../skills/playstore-publisher/references/promotion.md) for lifecycle checks, settings preservation, offline-plan limits and interrupted-operation recovery. Publishing support remains mock-tested, not live-validated.

## Recovery and CI details

Keep the same manifest and state directory across upload, validate and submit. The default `.play-state` is ignored by Git. Preserve it securely between CI steps and runs. Use app-scoped CI concurrency with cancellation disabled. Never automatically retry mutation commands.

The journal records each phase before mutation. Uploaded and validated journals can continue with the next command. Creating, uploading, validating or committing phases require manual reconciliation with the saved Google edit or Console. There is no automatic phase override or edit deletion command. For uncertain commits, query version-filtered status and Publishing overview before any new submission. Archive completed or explicitly reconciled journals before new releases. Remove stale locks only after checking the process is gone and reconciling the operation. Inspect has no release journal, so a failed inspect may require checking for an outstanding temporary edit.

Tests use mocked API responses. No live upload, credential setup or release submission runs in CI. Validate against a dedicated testing app before operational use.

## Official references

- [Edits and invalidation](https://developers.google.com/android-publisher/edits)
- [Commit conflict behavior](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit)
- [Release lifecycle](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases)
- [Tester API coverage](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.testers)
