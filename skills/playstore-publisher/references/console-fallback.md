# Existing-session Console fallback

Use this route when API access is unavailable, such as a read-only status request returning HTTP 403, and an existing signed-in Play Console session can access the authorized app. It is an alternative execution route, not a fix for API permissions. Respect an explicit CLI-only request. A status-only request remains read-only.

## Reconcile before changing anything

Verify the developer account, package, existing testing track, uploaded versions, release drafts and Publishing overview through visible Console state. Check any local journal and lock before starting Console mutations. If an earlier upload, validation, inspect or commit is uncertain, reconcile that operation first and preserve its evidence. Do not create another release or reupload merely because the CLI failed. Stop if identity, certificate, version, configuration or review conflicts remain unresolved.

Keep the existing testing track, tester configuration, country targeting and full rollout scope. Do not create credentials, expand permissions, change signing keys or cancel a pending review to enable this route. Existing end-to-end release authorization covers the same scoped Console submission, subject to any action-time tool requirements. Serialize Console and CLI work for the app.

## Verify the artifact and release

- Reuse an already-uploaded version when appropriate. For a new upload, retain the exact source revision, absolute AAB path and SHA-256. Verify the existing upload certificate before building, then verify the final AAB signature with `jarsigner -verify` and its certificate with `keytool -printcert -jarfile`. Signature integrity alone does not prove certificate identity.
- Use an independently verified pinned bundletool to validate the AAB and read its embedded package, version name and version code. `dump manifest --bundle <aab>` prints the manifest. Compare these values with the intended release and Console's uploaded versions before upload.
- If a genuine reviewed CLI manifest is already available, the offline `play plan` can still run without API access. Otherwise perform the artifact checks above and record the configuration reviewed in Console. Never invent a configuration fingerprint, fabricate a passing plan or mark a CLI journal phase complete for a browser action.
- Follow the available browser tool's upload instructions. Where supported, arm the file chooser before clicking the visible Upload control and pass the verified absolute path. Wait for processing and verify the displayed version before proceeding. Do not retry an uncertain upload.
- Review validation errors and warnings, release notes, supported-device changes, and full rollout. Confirm Publishing overview contains only the authorized changes before sending for review. Saving a draft or rollout is not review submission.

## Report what happened

Record which checks ran locally, which CLI operation failed, and which upload, validation and submission steps completed through Console. Keep credentials and account-specific operational records private. Console execution does not establish that the CLI mutation path was live-tested.

Preserve native status text along with any qualifying message. “Changes in review” can appear while quick checks still run and the page says changes will be sent after checks pass. In that case report **submission requested, pending quick checks**. Report review started, approval, publication and tester availability only when separately observed. Do not resubmit while checks or review are pending.
