# Security model

## Assets at risk

- Store publisher accounts
- Published application and extension revisions
- Tester and rollout configuration
- OAuth refresh tokens and service-account credentials
- Signing artifacts and unpublished packages

## Trust boundaries

The CLI accepts public identifiers and artifact paths. Authentication is delegated to provider-supported credential mechanisms. Secrets must not be stored in repository configuration.

CI should prefer short-lived workload identity credentials. Local use should prefer platform credential stores or application default credentials where the provider supports them.

## Required guards

Before mutation, an adapter verifies:

1. Provider and target identity
2. Expected package or extension version
3. Expected release channel or track
4. Absence of a conflicting active submission
5. Explicit execution mode

After mutation, an adapter fetches status independently and returns both normalized and provider-native states.

## Logging

Structured output may contain operation IDs, public resource names, versions, and lifecycle states. It must redact tokens, authorization headers, credential paths, private key identifiers, and raw provider error payloads that may contain secrets.
