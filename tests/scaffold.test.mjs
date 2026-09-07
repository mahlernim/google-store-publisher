import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url));

test("help distinguishes offline planning from explicit submission", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Plan is offline/);
  assert.match(result.stdout, /Only submit commits/);
});

test("providers lists both planned adapters", () => {
  const result = spawnSync(process.execPath, [cli, "providers"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "chrome-web-store\ngoogle-play\n");
});
