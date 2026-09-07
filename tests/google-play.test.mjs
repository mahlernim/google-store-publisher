import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { X509Certificate } from "node:crypto";
import { GooglePlay, GoogleTransport, PlayError, digest, canonical, parseManifest, normalizedState, verifyArtifact } from "../packages/google-play/dist/index.js";

const bytes = Buffer.from("synthetic bundle for transport tests, not a signed AAB");
const configuration = { googleGroups: ["testers@example.com"], countries: ["KR", "US"], restOfWorld: false, syncWithProduction: false };
const manifest = () => ({ packageName: "com.example.app", track: "closed-custom", versionName: "1.2.3", versionCode: "42", artifact: "release.aab", sha256: digest(bytes), uploadCertificateSha256: "a".repeat(64), expectedConfigurationSha256: digest(canonical(configuration)), releaseNotes: [{ language: "en-US", text: "A test release" }, { language: "ko-KR", text: "테스트 업데이트" }] });
test("artifact gates verify identity, signer, complete signature and unchanged bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "play-artifact-"));
  const artifact = join(dir, "fixture.aab");
  const pem = rootCertificates[0]; // Public certificate only, no private signing material.
  const m = { ...manifest(), artifact, uploadCertificateSha256: digest(new X509Certificate(pem).raw) };
  let fault = "";
  const run = async (program, args) => {
    if (program === "java") {
      const xpath = args.at(-1);
      if (xpath.endsWith("@package")) return fault === "package" ? "com.other.app" : m.packageName;
      if (xpath.endsWith("@android:versionName")) return m.versionName;
      return fault === "version" ? "43" : m.versionCode;
    }
    if (program === "jarsigner") return fault === "unsigned" ? "jar verified. unsigned entries" : "jar verified.";
    if (fault === "changed") await writeFile(artifact, "replaced during verification");
    return fault === "chain" ? pem + pem : pem;
  };
  try {
    await writeFile(artifact, bytes);
    assert.deepEqual(Buffer.from(await verifyArtifact(m, { bundletool: "bundletool.jar" }, run)), bytes);
    for (fault of ["package", "version", "unsigned", "chain", "changed"]) {
      await writeFile(artifact, bytes);
      await assert.rejects(verifyArtifact(m, { bundletool: "bundletool.jar" }, run), { code: "ARTIFACT_VERIFICATION" });
    }
    fault = "";
    await writeFile(artifact, bytes);
    await assert.rejects(verifyArtifact({ ...m, uploadCertificateSha256: "0".repeat(64) }, { bundletool: "bundletool.jar" }, run), { code: "ARTIFACT_VERIFICATION" });
  } finally { await rm(dir, { recursive: true }); }
});
class FakePlay {
  calls = [];
  current = { track: "closed-custom", releases: [{ status: "completed", versionCodes: ["41"], name: "1.2.2", countryTargeting: { countries: ["KR", "US"], includeRestOfWorld: false } }] };
  bundles = [{ versionCode: 41, sha256: "b".repeat(64) }];
  apks = [];
  native = "RELEASE_LIFECYCLE_STATE_PUBLISHED";
  countryCodes = ["US", "KR"];
  expired = false;
  uploadFailure = false;
  commitFailure = false;
  invalidUpload = false;
  async request(req) {
    this.calls.push(structuredClone(req));
    const path = req.path;
    if (path.endsWith("/releases")) return { releases: [{ track: "closed-custom", releaseName: "1.2.2", activeArtifacts: [{ versionCode: this.committed ? 42 : 41 }], releaseLifecycleState: this.committed ? "RELEASE_LIFECYCLE_STATE_IN_REVIEW" : this.native }] };
    if (path.endsWith("/edits") && req.method === "POST") return { id: "edit-123", expiryTimeSeconds: String(Date.now() / 1000 + 3600) };
    if (path.endsWith("/edit-123") && req.method === "GET") return { id: "edit-123", expiryTimeSeconds: this.expired ? "0" : String(Date.now() / 1000 + 3600) };
    if (path.endsWith("/edit-123") && req.method === "DELETE") return {};
    if (path.endsWith("/tracks")) return { tracks: [this.current] };
    if (path.includes("/testers/")) return { googleGroups: ["testers@example.com"] };
    if (path.includes("/countryAvailability/")) return { countries: this.countryCodes.map(countryCode => ({ countryCode })) };
    if (path.endsWith("/tracks/closed-custom")) {
      if (req.method === "PUT") this.current = structuredClone(req.body);
      return structuredClone(this.current);
    }
    if (path.endsWith("/bundles")) return { bundles: this.bundles };
    if (path.endsWith("/apks")) return { apks: this.apks };
    if (path.includes("/bundles?")) {
      if (this.uploadFailure) throw new PlayError("TRANSPORT", "Upload timeout", true);
      const bundle = { versionCode: 42, sha256: this.invalidUpload ? "0".repeat(64) : digest(req.media) };
      this.bundles.push(bundle);
      return bundle;
    }
    if (path.endsWith(":validate")) return {};
    if (path.includes(":commit?")) {
      this.committed = true;
      if (this.commitFailure) throw new PlayError("TRANSPORT", "Commit timeout", true);
      return { id: "edit-123" };
    }
    throw new Error(`Unhandled request ${req.method} ${path}`);
  }
}
const recorder = () => { const writes = []; return { writes, save: async j => { writes.push(structuredClone(j)); } }; };

test("full testing release preserves targeting and uses guarded commit with independent lifecycle read", async () => {
  const api = new FakePlay(), play = new GooglePlay(api), { writes, save } = recorder();
  const j = await play.upload(manifest(), bytes, save);
  assert.equal(j.phase, "uploaded");
  assert.equal(api.calls.filter(c => c.method === "PUT").length, 0);
  await play.validate(j, save);
  assert.equal(j.phase, "validated");
  assert.equal(api.calls.some(c => c.path.includes(":commit")), false);
  const result = await play.submit(j, save);
  assert.equal(result.committed, true);
  assert.equal(result.releases[0].normalizedState, "in-review");
  assert.deepEqual(api.current.releases[0].countryTargeting, { countries: ["KR", "US"], includeRestOfWorld: false });
  assert.equal(api.current.releases[0].status, "completed");
  assert.equal("userFraction" in api.current.releases[0], false);
  assert.equal(api.calls.filter(c => c.path.includes(":commit"))[0].path.endsWith("changesInReviewBehavior=ERROR_IF_IN_REVIEW"), true);
  assert.equal(api.calls.some(c => c.method !== "GET" && /testers|countryAvailability/.test(c.path)), false);
  assert.deepEqual(writes.map(j => j.phase), ["creating", "creating", "uploading", "uploaded", "validating", "validated", "committing", "committed"]);
});
test("inspect hashes order-independent configuration and does not expose group addresses", async () => {
  const api = new FakePlay();
  const result = await new GooglePlay(api).inspect("com.example.app", "closed-custom");
  assert.equal(result.configurationSha256, manifest().expectedConfigurationSha256);
  assert.equal(JSON.stringify(result).includes("testers@example.com"), false);
  assert.equal(api.calls.at(-1).method, "DELETE");
  assert.match(result.testerCoverage, /individual email/);
});
test("every pending, rejected and unknown lifecycle prevents creating an edit", async () => {
  for (const state of ["IN_REVIEW", "DRAFT", "NOT_SENT_FOR_REVIEW", "APPROVED_NOT_PUBLISHED", "NOT_APPROVED", "FUTURE_STATE"]) {
    const api = new FakePlay(); api.native = `RELEASE_LIFECYCLE_STATE_${state}`;
    await assert.rejects(new GooglePlay(api).upload(manifest(), bytes, recorder().save), { code: "REVIEW_CONFLICT" });
    assert.equal(api.calls.some(c => c.method !== "GET"), false);
  }
});
test("unexpected settings, APK codes and staged tracks block upload", async () => {
  for (const setup of [a => { a.countryCodes = ["KR"]; }, a => { a.apks = [{ versionCode: 42 }]; }, a => { a.current.releases[0].status = "inProgress"; }, a => { a.current.releases[0].versionCodes = ["40", "41"]; }]) {
    const api = new FakePlay(); setup(api);
    await assert.rejects(new GooglePlay(api).upload(manifest(), bytes, recorder().save));
    assert.equal(api.calls.some(c => c.media), false);
  }
});
test("uncertain upload preserves uploading phase and never retries", async () => {
  const api = new FakePlay(); api.uploadFailure = true;
  const { save, writes } = recorder();
  await assert.rejects(new GooglePlay(api).upload(manifest(), bytes, save), { uncertain: true });
  assert.equal(writes.at(-1).phase, "uploading");
  assert.equal(api.calls.filter(c => c.media).length, 1);
});
test("returned bundle digest must match uploaded bytes", async () => {
  const api = new FakePlay(); api.invalidUpload = true;
  await assert.rejects(new GooglePlay(api).upload(manifest(), bytes, recorder().save), { code: "UPLOAD_MISMATCH" });
});
test("edit expiry, configuration drift, bundle replacement and track drift prevent commit", async () => {
  for (const setup of [a => { a.expired = true; }, a => { a.countryCodes = ["KR"]; }, a => { a.bundles[1].sha256 = "0".repeat(64); }, a => { a.current.releases[0].name = "unexpected"; }]) {
    const api = new FakePlay(), play = new GooglePlay(api), { save } = recorder();
    const j = await play.upload(manifest(), bytes, save); await play.validate(j, save); setup(api);
    await assert.rejects(play.submit(j, save));
    assert.equal(api.calls.some(c => c.path.includes(":commit")), false);
  }
});
test("uncertain commit remains committing and second submit refuses", async () => {
  const api = new FakePlay(), play = new GooglePlay(api), { save, writes } = recorder();
  const j = await play.upload(manifest(), bytes, save); await play.validate(j, save); api.commitFailure = true;
  await assert.rejects(play.submit(j, save), { uncertain: true });
  assert.equal(writes.at(-1).phase, "committing");
  await assert.rejects(play.submit(j, save), { code: "INVALID_PHASE" });
  assert.equal(api.calls.filter(c => c.path.includes(":commit")).length, 1);
  assert.equal((await play.status("com.example.app", "closed-custom", "42")).releases[0].normalizedState, "in-review");
});
test("journal is saved before creating the remote edit", async () => {
  const api = new FakePlay();
  await assert.rejects(new GooglePlay(api).upload(manifest(), bytes, async () => { throw new Error("disk full"); }));
  assert.equal(api.calls.some(c => c.method === "POST"), false);
});
test("status is pure GET and wait never treats approved or in-review as published", async () => {
  const api = new FakePlay(), play = new GooglePlay(api);
  api.native = "RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED";
  const result = await play.wait("com.example.app", "closed-custom", "41", 0);
  assert.equal(result.timedOut, true);
  assert.equal(result.releases[0].normalizedState, "approved");
  assert.equal(api.calls.every(c => c.method === "GET"), true);
  api.native = "RELEASE_LIFECYCLE_STATE_NOT_APPROVED";
  await assert.rejects(play.wait("com.example.app", "closed-custom", "41", 0), { code: "REJECTED" });
  assert.equal(normalizedState("RELEASE_LIFECYCLE_STATE_PUBLISHED"), "published");
  assert.equal(normalizedState("new"), "unknown");
});
test("invalid manifests and production are rejected before I/O", () => {
  for (const change of [{ track: "production" }, { track: "../production" }, { versionCode: "0" }, { versionCode: 42 }, { sha256: "bad" }, { releaseNotes: [{ language: "en-US", text: "x".repeat(501) }] }, { ignoredFlag: true }]) assert.throws(() => parseManifest({ ...manifest(), ...change }));
});
test("artifact verifier fails closed without exposing missing paths", async () => {
  await assert.rejects(verifyArtifact(manifest(), { bundletool: "missing.jar" }), { code: "ARTIFACT_VERIFICATION" });
});
test("transport uses fixed host, blocks redirects, and does not retry or expose provider errors", async () => {
  const calls = [];
  const transport = new GoogleTransport(async (url, init) => { calls.push({ url, init }); return new Response("secret provider body", { status: 503 }); }, async () => "synthetic-token");
  await assert.rejects(transport.request({ method: "POST", path: "applications/com.example.app/edits", body: {} }), e => e.code === "HTTP_503" && e.uncertain && !e.message.includes("secret"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(new URL(calls[0].url).host, "androidpublisher.googleapis.com");
  await assert.rejects(transport.request({ method: "GET", path: "https://evil.example" }), { code: "INVALID_PATH" });
  assert.equal(calls.length, 1);
});
test("CLI rejects mutation without execute and unsupported flags before authentication", () => {
  const cli = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url));
  for (const args of [["play", "submit", "--manifest", "missing.json"], ["play", "status", "--execute"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error.code, /EXECUTION_REQUIRED|ARGUMENT/);
  }
});
