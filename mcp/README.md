# MCP server

The MCP server is intentionally deferred until the CLI commands and provider contracts are stable.

It will expose bounded operations rather than raw provider APIs. Read-only tools will be separate from state-changing tools, and every mutation will require exact target and version guards.
