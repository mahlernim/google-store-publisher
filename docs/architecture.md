# Architecture

## Layering

The project uses one-way dependencies.

```text
skills and MCP
      ↓
     CLI
      ↓
provider adapters
      ↓
provider APIs
```

The core package contains types and normalized outcomes. It does not perform network requests and does not own credentials.

## Provider boundary

Every provider implements the same high-level capabilities where they genuinely exist:

- inspect a target
- validate a proposed operation
- upload an artifact
- submit an uploaded revision
- fetch status
- change rollout

Provider-native states remain available in every result. A normalized state is supplemental and must never replace the native state needed for operational decisions.

## Chrome Web Store adapter

The Chrome adapter will target API v2 and support existing items only. Initial item creation, visibility changes, policy questionnaires, and listing setup remain dashboard operations.

The adapter implements `fetchStatus`, ZIP upload, publish, staged publish, percentage rollout, and cancellation. It accepts an injected short-lived token or obtains one through Google Cloud CLI service-account impersonation. The CLI validates artifacts, enforces expected versions, detects conflicting submissions, and reconciles status after mutations.

## Google Play adapter

The Play adapter implements testing-track publication through a fresh edit, verified bundle upload, exact track update, validation, guarded commit and lifecycle reads. Upload, validate and submit are separate journaled commands. Status and wait are pure reads, while configuration inspection creates a temporary edit. See the [provider guide](../providers/google-play/README.md) for the supported scope and recovery limits.

An existing review is a conflict. The adapter must not cancel or supersede it implicitly.

## Automation layers

The CLI is the source of truth. CI workflows and the installable skill call the CLI. A future MCP server exposes only bounded CLI capabilities and adds no publishing logic of its own.
