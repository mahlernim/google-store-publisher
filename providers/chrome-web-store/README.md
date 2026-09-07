# Chrome Web Store provider

This package contains the Chrome Web Store API V2 adapter used by the repository CLI.

Implemented operations:

1. Read-only `fetchStatus`
2. Package upload
3. Publish with warnings blocked by default
4. Staged publishing and percentage rollout
5. Explicit submission cancellation

The adapter uses short-lived access tokens. Set `CWS_ACCESS_TOKEN` for CI, or configure `CWS_SERVICE_ACCOUNT` and optionally `CWS_PROJECT_ID` for local Google Cloud CLI impersonation.

Package validation and mutation guards belong to the CLI. The provider never stores credentials and redacts raw provider error messages.
