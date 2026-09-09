# Production releases and localized listings

Use for production destinations, rollout changes or store text. This describes routing and a provider workflow, not new commands in the current shared CLI.

## Select a supported execution route

Google's Edits API supports bundle uploads, production track updates, localized listings, validation and commit. The current shared CLI rejects production destinations and has no listing-update workflow. Verify help, implementation and relevant tests before treating a later version as supporting those operations. Removing a production guard alone does not adapt testing-specific configuration checks or recovery handling.

Prefer an already available, verified client that handles the complete scoped transaction and existing authentication. Other maintained clients, such as fastlane supply, can support production and metadata, but switching clients requires checking their actual authentication, preservation, commit and retry behavior. Do not assume a client's feature list proves compatibility with the existing credentials or recovery requirements. When a suitable client is unavailable, follow the [Console fallback](console-fallback.md) within existing authorization. An explicit CLI-only constraint remains binding.

A CLI-only request does not itself forbid another compatible CLI, unless the user named a required client. Use an available compatible CLI within the existing authorization when possible. If no suitable route exists, report the specific missing capability or access and ask only for the decision needed to proceed. Do not enter Console without a change to the CLI-only constraint.

## Prepare one scoped change set

- Establish the exact app, destination, rollout, artifact and metadata scope from current instructions and private workspace records. Do not infer production-only, full rollout, a country list or a set of languages from another app's release.
- Check current releases, outstanding edits/journals and relevant unpublished Console changes before starting a new transaction. Reconcile conflicts without canceling an existing review or adopting an unrelated draft. Release lifecycle reads alone do not establish the absence of pending listing changes.
- For an existing uploaded version, pin its exact code and trusted digest and reuse it. For a fresh bundle, verify source provenance, digest, upload certificate and embedded package/version. Reuse verified CI artifacts when available.
- Build metadata from the workspace's canonical locale files. Inspect actual existing listing languages rather than assuming that repository directories are all published. Map repository locale identifiers to provider-accepted identifiers explicitly. Check current title and description limits, required fields and localized release-note limits.
- Capture a private before/after manifest for affected fields. Listings are app-level metadata shared across tracks. Preserve unrelated languages, graphics, contact information and disclosures. Adding a language or using fallback graphics must fit the user's intended audience and scope. Localized text does not establish localized screenshots.

## API transaction when supported

1. Acquire app-level coordination and create one edit only after reconciling earlier work. Persist its identity, baselines, intended values and artifact digest in a private journal. Console edits and other writers can invalidate an API edit, so do not interleave them.
2. Upload the new bundle once, or reuse the verified uploaded version. Compare the provider's returned version and digest. Stage the exact production release and only the intended localized listing changes in the same edit when supported. Preserve unrelated track fields and configuration. A full rollout uses track status `completed`, but that status is not proof of review approval or publication.
3. Read back staged fields, reconcile the intended diff and validate the edit. Do not replace all listings or releases from an incomplete local snapshot. Persist in-flight journal phases before writes, then record completed phases only after their actions are confirmed.
4. Commit once for the authorized scope. Retain the server-side `changesInReviewBehavior=ERROR_IF_IN_REVIEW` guard. Client-side preflight alone does not protect against a review starting before commit. Google's default can cancel an existing review and resubmit changes. If the provider requires Console review submission, report the saved state and complete that scoped handoff without pretending commit success was submission.
5. Reconcile native lifecycle and any qualifying Console state. After an uncertain upload or commit, preserve the journal and inspect remote state instead of replaying the transaction. A failed status read after commit is not a reason to submit again.

Bulk file-driven metadata updates remove repetitive locale navigation. They do not bypass Google checks, legal declarations or review. Keep unsupported declarations and visual review in Console as needed, after reconciling any API edit.

## References

- [Edits and Console interaction](https://developers.google.com/android-publisher/edits)
- [Production tracks and rollout status](https://developers.google.com/android-publisher/tracks)
- [Localized listing updates](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.listings/update)
- [Commit and review behavior](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit)
- [Listing metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)
- [Fastlane supply capabilities](https://docs.fastlane.tools/actions/upload_to_play_store/)
