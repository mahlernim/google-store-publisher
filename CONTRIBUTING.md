# Contributing

Thanks for helping build Google Store Publisher.

## Development

```shell
corepack pnpm install
corepack pnpm lint
corepack pnpm test
```

Keep provider-specific behavior inside its provider adapter. Shared code may normalize results, but it must not erase meaningful distinctions between Google Play and Chrome Web Store release states.

Never commit credentials, access tokens, refresh tokens, service-account keys, signing material, store artifacts, or real publisher configuration.

State-changing behavior requires tests for the expected target, expected version, dry-run output, conflict handling, and post-operation reconciliation.
