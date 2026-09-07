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

## Planned Chrome Web Store adapter

The Chrome adapter will target API v2 and support existing items only. Initial item creation, visibility changes, policy questionnaires, and listing setup remain dashboard operations.

The first implementation milestone is read-only `fetchStatus`. Upload, publish, staged publish, percentage rollout, and cancellation follow after status fixtures and authentication are tested.

## Planned Google Play adapter

The Play adapter will initially inspect applications, tracks, releases, testers, and country availability. Publication will use a fresh edit, bundle upload, exact track update, validation, commit, and lifecycle reconciliation.

An existing review is a conflict. The adapter must not cancel or supersede it implicitly.

## Automation layers

The CLI is the source of truth. CI workflows call the CLI. A future skill explains when and how to call it. A future MCP server exposes only bounded CLI capabilities and adds no publishing logic of its own.
