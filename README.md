# Google Store Publisher

Google Store Publisher is a safety-first publishing toolkit for Google Play and the Chrome Web Store. It provides one audited command-line interface for local workflows, CI, and agent skills.

## Current status

The Google Play testing-track provider supports artifact verification, separate upload, validation and submission stages, lifecycle status, and durable local journals. The Chrome Web Store API V2 provider supports status, ZIP validation and upload, review submission or cancellation, staged publishing, and percentage rollout.

Both providers are implemented with mocked API coverage. Live Google Play acceptance and live Chrome Web Store mutation have not yet been tested.

## Why this repository exists

Browser-based developer consoles are useful for initial setup and policy work, but repetitive package uploads and status checks are slow and fragile. Both Google Play and Chrome Web Store API v2 expose programmatic release lifecycles. This project will make those APIs composable without exposing arbitrary account-wide operations.

## Chrome Web Store commands

```text
store-publisher chrome status --publisher ID --item ID
store-publisher chrome validate --artifact extension.zip --version 1.2.3
store-publisher chrome upload --publisher ID --item ID --artifact extension.zip --version 1.2.3
store-publisher chrome submit --publisher ID --item ID --artifact extension.zip --version 1.2.3
store-publisher chrome cancel --publisher ID --item ID --version 1.2.3
store-publisher chrome rollout --publisher ID --item ID --version 1.2.3 --percentage 100
```

Add `--execute` only after reviewing the dry-run output. `submit` uploads the verified artifact immediately before submission so the submitted draft cannot silently differ from the validated ZIP. Published, submitted, and asynchronous upload states remain distinct in structured output.

Authentication uses `CWS_ACCESS_TOKEN` when a short-lived token is injected by CI. Local use can set `CWS_SERVICE_ACCOUNT` and optionally `CWS_PROJECT_ID`; the provider asks Google Cloud CLI for a scoped impersonated token. Persistent OAuth refresh tokens and service-account key files are not required.

## Google Play commands

Google Play commands use the `play` prefix. Status and wait are read-only. Inspect creates a temporary edit and requires explicit execution. Plan verifies artifacts offline. Upload and validate stage a journaled edit, while only submit commits it for review. See the [Google Play guide](providers/google-play/README.md).

## Repository layout

```text
packages/core/               Shared contracts and normalized results
packages/cli/                Command-line entry point
packages/google-play/        Implemented Android Publisher adapter
providers/chrome-web-store/  Chrome Web Store API v2 design notes
providers/google-play/       Google Play Android Publisher design notes
skills/playstore-publisher/  Google Play publishing skill
skills/chrome-webstore-publisher/ Chrome extension publishing skill
mcp/                         Future bounded MCP server
examples/                    Credential-free configuration examples
docs/                        Architecture and security model
```

## Build and test

```shell
corepack pnpm install
corepack pnpm build
node packages/cli/dist/index.js --help
corepack pnpm test
```

## Install the skills

Build and link the shared CLI from a clone, then install `skills/playstore-publisher` and `skills/chrome-webstore-publisher` into your Codex skills directory. Each skill is independently installable and contains its own setup reference. Invoke them as `$playstore-publisher` and `$chrome-webstore-publisher`.

```shell
corepack pnpm install --frozen-lockfile
corepack pnpm build
cd packages/cli
npm link
```

If the old combined `store-publisher` skill is installed, archive it outside the skills directory after verifying the replacements so it does not compete with them. Installing skills does not configure Google credentials or submit any release. A packaged CLI installer remains future work.

## Roadmap

1. Exercise Chrome Web Store status against an owned extension.
2. Exercise guarded upload and staged submission against a non-production release.
3. Validate the Google Play workflow against a dedicated testing app.
4. Extend Google Play coverage after testing-track acceptance.
5. Package the stable CLI for simpler installation.
6. Expose proven operations through a narrow MCP server.

See [Architecture](docs/architecture.md) and [Security model](docs/security-model.md).

## License

Apache License 2.0.
