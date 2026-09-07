# Chrome Web Store setup

## CLI installation

From a clone of `https://github.com/mahlernim/google-store-publisher`:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm build
cd packages/cli
npm link
```

Confirm `store-publisher --help` succeeds before using the skill. The source checkout is currently required because the CLI has not been released as a package.

## Authentication

Google Cloud setup is required once per publisher.

1. Enable Chrome Web Store API in a Google Cloud project.
2. Create a service account without downloading a key.
3. Add its email in Chrome Web Store Developer Dashboard under Account.
4. Grant the local operator `roles/iam.serviceAccountTokenCreator` for impersonation.
5. Install Google Cloud CLI and authenticate the local operator.
6. Record the publisher ID and extension item ID.

Set these non-secret values through command options or environment variables.

- `CWS_PUBLISHER_ID`
- `CWS_ITEM_ID`
- `CWS_SERVICE_ACCOUNT`
- `CWS_PROJECT_ID`

CI may inject `CWS_ACCESS_TOKEN` only when it is short lived and protected from logs.

API V2 cannot create the initial item or edit listing text, images, privacy declarations, visibility, or detailed policy information. Use the Developer Dashboard for those tasks.

Official documentation:

- https://developer.chrome.com/docs/webstore/api
- https://developer.chrome.com/docs/webstore/using-api
- https://developer.chrome.com/docs/webstore/service-accounts
