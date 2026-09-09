# Existing-session Console fallback

Use this route when the installed client lacks the required operation, API access is unavailable, or Google requires a Console-only step. It is an alternative execution route, not proof that API permissions were fixed. Respect an explicit CLI-only request. A status-only request remains read-only. Use the user's selected browser or the workspace's recorded preference.

## Reconcile before changing anything

Verify the developer account, package, requested track, uploaded versions, release drafts and Publishing overview through visible Console state. A signup page can mean the wrong signed-in account is selected. Inspect the existing account chooser before requesting credentials or account creation. Ask for login or other user interaction only when the selected route actually requires it.

Check any local journal and lock before starting Console mutations. If an earlier upload, validation, inspect or commit is uncertain, reconcile that operation first and preserve its evidence. Do not create another release or reupload merely because the CLI failed. Reuse a draft only when it is identified as the intended draft for this task. Stop if identity, certificate, version, configuration or review conflicts remain unresolved.

Apply only the requested track, rollout and listing changes. Preserve tester configuration, country targeting and other settings unless changes were authorized. Do not create credentials, expand permissions, change signing keys or cancel a pending review to enable this route. Existing end-to-end release authorization covers the same scoped Console submission, subject to any action-time tool requirements. Serialize Console and CLI work for the app.

## Verify the artifact and release

- Reuse an already-uploaded version when appropriate. For a new upload, retain the exact source revision, absolute AAB path and SHA-256. Verify the AAB signature with `jarsigner -verify` and its certificate with `keytool -printcert -jarfile`, comparing against the current upload certificate before upload. Reuse a verified immutable artifact rather than requiring another build. Signature integrity alone does not prove certificate identity.
- Use an independently verified pinned bundletool to validate the AAB and read its embedded package, version name and version code. `dump manifest --bundle <aab>` prints the manifest. Compare these values with the intended release and Console's uploaded versions before upload.
- If a genuine reviewed CLI manifest is already available, the offline `play plan` can still run without API access. Otherwise perform the artifact checks above and record the configuration reviewed in Console. Never invent a configuration fingerprint, fabricate a passing plan or mark a CLI journal phase complete for a browser action.
- Follow the available browser tool's upload instructions. Where supported, arm the file chooser before clicking the visible Upload control and pass the verified absolute path. Wait for processing and verify the displayed version before proceeding. After a chooser timeout, inspect the draft for an accepted or in-progress upload before any retry or browser change. A timeout alone does not establish a file-permission problem.
- Review validation errors and warnings, localized release notes, supported-device changes, countries and the requested rollout. Preserve current signing and protection settings. Unexpected loss of compatible devices requires investigation before continuing.

## Localized text and final submission

Use the scoped file set and before/after manifest from [production and listings](production-and-listings.md). Select each language explicitly and verify its identity before filling fields. Do not assume a Next language control has a stable order, because validation errors can reorder languages. Read back each title and description against its source before saving.

Preserve existing graphics and asset declarations during text edits. Do not infer an asset's origin from its appearance or relabel assets just to finish the flow. Controls can move between a review step and an overflow menu. Inspect the current UI for the action that saves the scoped changes and verify the saved result, rather than repeating a remembered sequence.

Complete the release preview/save flow, then inspect Publishing overview. It must contain exactly the authorized release and listing changes intended for this submission. Leave unrelated pending changes out of the submission and reconcile any blocking conflict. Complete the visible send-for-review confirmation. Saving a draft, saving a rollout or saving listings alone is not review submission.

## Report what happened

Record which checks ran locally, which CLI operation failed, and which upload, validation and submission steps completed through Console. Keep credentials and account-specific operational records private. Console execution does not establish that the CLI mutation path was live-tested.

Preserve native status text along with any qualifying message. “Changes in review” can appear while quick checks still run and the page says changes will be sent after checks pass. In that case report **submission requested, pending quick checks**. Report review started, approval, publication and tester availability only when separately observed. Do not resubmit while checks or review are pending.
