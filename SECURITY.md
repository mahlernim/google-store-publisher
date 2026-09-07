# Security policy

## Reporting a vulnerability

Do not open a public issue for credential exposure or a vulnerability that could publish, cancel, halt, or roll back a store release. Use GitHub private vulnerability reporting when it is enabled for this repository.

## Credential rules

- Credentials must come from the runtime environment or a platform credential provider.
- Credentials and tokens must never appear in command output, logs, fixtures, examples, or error details.
- Long-lived JSON keys are not the preferred CI authentication mechanism.
- Provider permissions must be limited to the intended publisher, application, and operation.
- Configuration files may contain public resource identifiers but not secrets.

## Mutation rules

- Read-only inspection is the default.
- Every mutation names the exact provider, resource, version, and environment.
- Upload and submit remain separate operations.
- Existing reviews or submissions are not cancelled implicitly.
- Ambiguous state fails closed and requires read reconciliation.
- Successful API responses are followed by provider status verification.
