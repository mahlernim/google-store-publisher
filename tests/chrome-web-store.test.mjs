import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ChromeWebStoreApiError,
  ChromeWebStoreClient,
  assertNoConflictingSubmission,
  inspectChromeArtifact,
  normalizeChromeState,
} from "../providers/chrome-web-store/dist/index.js";

const cli = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url));

function storedZip(name, contents) {
  const fileName = Buffer.from(name);
  const data = Buffer.from(contents);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + data.length, 16);
  return Buffer.concat([local, fileName, data, central, fileName, end]);
}

test("artifact inspection verifies the root manifest and version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "store-publisher-"));
  const path = join(directory, "extension.zip");
  await writeFile(path, storedZip("manifest.json", JSON.stringify({ version: "1.2.3" })));
  const artifact = await inspectChromeArtifact(path);
  assert.equal(artifact.version, "1.2.3");
  assert.equal(artifact.sha256.length, 64);
  assert.equal(artifact.sizeBytes, artifact.bytes.length);
});

test("artifact inspection rejects a nested manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "store-publisher-"));
  const path = join(directory, "extension.zip");
  await writeFile(path, storedZip("nested/manifest.json", JSON.stringify({ version: "1.0.0" })));
  await assert.rejects(() => inspectChromeArtifact(path), /ZIP root/);
});

test("status uses API v2 and never returns the access token", async () => {
  let observedAuthorization;
  const fetchImplementation = async (url, init) => {
    assert.equal(url, "https://chromewebstore.googleapis.com/v2/publishers/pub/items/item:fetchStatus");
    observedAuthorization = init.headers.Authorization;
    return new Response(JSON.stringify({ itemId: "item", submittedItemRevisionStatus: {
      distributionChannels: [{ crxVersion: "2.0.0" }], state: "PENDING_REVIEW" } }),
    { headers: { "content-type": "application/json" }, status: 200 });
  };
  const client = new ChromeWebStoreClient(
    { itemId: "item", publisherId: "pub" },
    { fetchImplementation, tokenProvider: async () => "test-token" },
  );
  const status = await client.fetchStatus();
  assert.equal(observedAuthorization, "Bearer test-token");
  assert.equal(normalizeChromeState(status), "in-review");
  assert.doesNotMatch(JSON.stringify(status), /test-token/);
});

test("provider errors redact raw response messages", async () => {
  const client = new ChromeWebStoreClient(
    { itemId: "item", publisherId: "pub" },
    { fetchImplementation: async () => new Response(
      JSON.stringify({ error: { message: "token secret", status: "PERMISSION_DENIED" } }),
      { headers: { "content-type": "application/json" }, status: 403 }),
      tokenProvider: async () => "test-token" },
  );
  await assert.rejects(() => client.fetchStatus(), (error) =>
    error instanceof ChromeWebStoreApiError && error.reason === "PERMISSION_DENIED" &&
    !error.message.includes("token secret"));
});

test("publish blocks warnings and uses staged publishing when requested", async () => {
  let observed;
  const client = new ChromeWebStoreClient(
    { itemId: "item", publisherId: "pub" },
    { fetchImplementation: async (url, init) => {
      observed = { body: JSON.parse(init.body), method: init.method, url };
      return new Response(JSON.stringify({ state: "PENDING_REVIEW" }), { status: 200 });
    }, tokenProvider: async () => "test-token" },
  );
  await client.publish({ staged: true });
  assert.deepEqual(observed, {
    body: { blockOnWarnings: true, publishType: "STAGED_PUBLISH", skipReview: false },
    method: "POST",
    url: "https://chromewebstore.googleapis.com/v2/publishers/pub/items/item:publish",
  });
});

test("upload uses the media endpoint and raw ZIP content", async () => {
  let observed;
  const client = new ChromeWebStoreClient(
    { itemId: "item", publisherId: "pub" },
    { fetchImplementation: async (url, init) => {
      observed = { body: init.body, method: init.method, url };
      return new Response(JSON.stringify({ uploadState: "SUCCEEDED" }), { status: 200 });
    }, tokenProvider: async () => "test-token" },
  );
  await client.upload(Buffer.from("zip"));
  assert.equal(observed.method, "POST");
  assert.equal(observed.url,
    "https://chromewebstore.googleapis.com/upload/v2/publishers/pub/items/item:upload");
  assert.equal(await observed.body.text(), "zip");
});

test("CLI upload defaults to an offline dry run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "store-publisher-"));
  const path = join(directory, "extension.zip");
  await writeFile(path, storedZip("manifest.json", JSON.stringify({ version: "3.0.0" })));
  const result = spawnSync(process.execPath, [cli, "chrome", "upload",
    "--publisher", "pub", "--item", "item", "--artifact", path, "--version", "3.0.0"],
  { encoding: "utf8", env: { ...process.env, CWS_ACCESS_TOKEN: "" } });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.changed, false);
  assert.equal(output.executionMode, "dry-run");
  assert.equal(output.artifact.version, "3.0.0");
});

test("active review and staged approval are upload conflicts", () => {
  assert.throws(() => assertNoConflictingSubmission({
    submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }), /conflicting/i);
  assert.throws(() => assertNoConflictingSubmission({
    submittedItemRevisionStatus: { state: "STAGED" } }), /conflicting/i);
});
