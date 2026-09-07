#!/usr/bin/env node

import { operations, providers } from "@google-store-publisher/core";

const help = `Google Store Publisher scaffold

Usage:
  store-publisher --help
  store-publisher providers

Planned operations:
  ${operations.join("\n  ")}

This scaffold performs no network or store mutations.
`;

const [command] = process.argv.slice(2);

if (command === "providers") {
  process.stdout.write(`${providers.join("\n")}\n`);
  process.exit(0);
}

if (command === undefined || command === "--help" || command === "-h") {
  process.stdout.write(help);
  process.exit(0);
}

process.stderr.write(`Unknown scaffold command: ${command}\n\n${help}`);
process.exitCode = 2;
