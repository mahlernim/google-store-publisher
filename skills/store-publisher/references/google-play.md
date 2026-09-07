# Google Play setup and boundaries

Google Play support is limited to existing testing tracks, one AAB per release, and full rollout. Production and staged rollout are unsupported.

Use Google Application Default Credentials with app-scoped testing-release access. Install Java, jarsigner, keytool, and an independently verified pinned bundletool release.

Start with a reviewed release manifest containing the package, testing track, version name, version code, AAB path and SHA-256, upload-certificate SHA-256, configuration SHA-256, and localized release notes.

The safe sequence is:

1. `store-publisher play status`
2. `store-publisher play inspect --execute`
3. `store-publisher play plan`
4. `store-publisher play upload --execute`
5. `store-publisher play validate --execute`
6. `store-publisher play submit --execute`
7. `store-publisher play wait`

Keep the manifest and `.play-state` directory unchanged between mutation steps. Upload and validation do not submit the release. Submit is the only commit.

An uncertain upload or commit requires manual API and Console reconciliation. Do not retry automatically, remove the journal, or remove a stale lock without verifying the process and remote edit state.

Commit success is not approval or tester availability. Preserve and report native lifecycle states. Verify actual tester availability separately when required.

Official documentation:

- https://developers.google.com/android-publisher/edits
- https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit
- https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases
