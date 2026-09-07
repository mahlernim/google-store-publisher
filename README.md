# Google Store Publisher

Google Store Publisher is a planned, safety-first publishing toolkit for Google Play and the Chrome Web Store. The repository will provide one audited command-line interface that can later support CI workflows, agent skills, and a narrow MCP server.

## Current status

This repository is an initial scaffold. It contains shared release contracts, a buildable CLI shell, architecture documentation, and CI. It does not authenticate with Google or perform uploads, submissions, cancellations, or rollouts yet.

## Why this repository exists

Browser-based developer consoles are useful for initial setup and policy work, but repetitive package uploads and status checks are slow and fragile. Both Google Play and Chrome Web Store API v2 expose programmatic release lifecycles. This project will make those APIs composable without exposing arbitrary account-wide operations.

## Planned command surface

```text
store-publisher inspect
store-publisher upload
store-publisher validate
store-publisher submit
store-publisher status
store-publisher rollout
```

Read-only inspection will be the default. State-changing commands will require an exact provider, target, artifact version, and explicit execution mode.

## Repository layout

```text
packages/core/               Shared contracts and normalized results
packages/cli/                Command-line entry point
providers/chrome-web-store/  Chrome Web Store API v2 design notes
providers/google-play/       Google Play Android Publisher design notes
skills/store-publisher/      Future agent skill
mcp/                         Future bounded MCP server
examples/                    Credential-free configuration examples
docs/                        Architecture and security model
```

## Try the scaffold

```shell
corepack pnpm install
corepack pnpm build
node packages/cli/dist/index.js --help
corepack pnpm test
```

## Roadmap

1. Implement read-only Chrome Web Store API v2 status inspection.
2. Add Chrome package upload, validation, submission, and staged publishing.
3. Implement read-only Google Play track and release lifecycle inspection.
4. Add fail-closed Google Play test-track publication.
5. Stabilize the CLI and publish an agent skill.
6. Expose the proven operations through a narrow MCP server.

See [Architecture](docs/architecture.md) and [Security model](docs/security-model.md).

## License

Apache License 2.0.
