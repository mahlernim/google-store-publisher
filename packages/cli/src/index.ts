#!/usr/bin/env node
import { providers } from "@google-store-publisher/core";
import { GooglePlay, GoogleTransport, PlayError, parseManifest, canonical, verifyArtifact, target, type Journal } from "@google-store-publisher/google-play";
import { mkdir, open, readFile, rename, unlink, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { chromeErrorResult, runChrome } from "./chrome.js";
import { runPromotion } from "./promotion.js";

const help = `Google Store Publisher

  store-publisher providers
  store-publisher play status --package com.example.app --track alpha [--version-code 42]
  store-publisher play wait --package com.example.app --track alpha --version-code 42 [--timeout 300]
  store-publisher play inspect --package com.example.app --track alpha --execute
  store-publisher play plan --manifest release.json --bundletool bundletool.jar
  store-publisher play upload --manifest release.json --bundletool bundletool.jar --execute
  store-publisher play validate --manifest release.json --execute
  store-publisher play submit --manifest release.json --execute
  store-publisher play promote-plan --manifest promotion.json
  store-publisher play promote-prepare --manifest promotion.json --execute
  store-publisher play promote-validate --manifest promotion.json --execute
  store-publisher play promote-submit --manifest promotion.json --execute
  store-publisher chrome status --publisher ID --item ID
  store-publisher chrome validate --artifact extension.zip --version 1.2.3
  store-publisher chrome upload --publisher ID --item ID --artifact extension.zip --version 1.2.3 [--execute]
  store-publisher chrome submit --publisher ID --item ID --artifact extension.zip --version 1.2.3 [--staged] [--execute]
  store-publisher chrome cancel --publisher ID --item ID --version 1.2.3 [--execute]
  store-publisher chrome rollout --publisher ID --item ID --version 1.2.3 --percentage 100 [--execute]

All output is JSON except help and providers. Plan is offline and verifies the AAB.
Status and wait are read-only. Inspect creates and deletes a temporary edit.
Upload and validate stage an edit. Only submit commits it for review.
--state-dir defaults to .play-state for inspect, upload, validate, submit and promotion mutations.
Share one absolute state directory for these commands. Omit it for status, wait, plan and promote-plan.
Java, jarsigner and keytool come from PATH, or --java, --jarsigner and --keytool.
Play authentication uses Google Application Default Credentials.
Chrome accepts CWS_ACCESS_TOKEN or gcloud service-account impersonation.
Chrome mutations are dry runs unless --execute is present.
`;
const output = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
const required = (value: string | undefined, key: string) => {
  if (!value) throw new PlayError("ARGUMENT", `Missing --${key}.`);
  return value;
};
async function main() {
  const { values: v, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: "boolean", short: "h" }, execute: { type: "boolean" },
    package: { type: "string" }, track: { type: "string" }, "version-code": { type: "string" },
    manifest: { type: "string" }, bundletool: { type: "string" }, "state-dir": { type: "string" },
    timeout: { type: "string" }, java: { type: "string" }, jarsigner: { type: "string" }, keytool: { type: "string" },
    publisher: { type: "string" }, item: { type: "string" }, artifact: { type: "string" },
    version: { type: "string" }, percentage: { type: "string" }, project: { type: "string" },
    "service-account": { type: "string" }, staged: { type: "boolean" },
    "skip-review": { type: "boolean" }, "allow-warnings": { type: "boolean" },
  } });
  if (v.help || positionals.length === 0) { process.stdout.write(help); return; }
  if (positionals[0] === "providers" && positionals.length === 1) { process.stdout.write(providers.join("\n") + "\n"); return; }
  const [provider, command] = positionals;
  if (provider === "play" && positionals.length === 2 && command?.startsWith("promote-")) {
    await runPromotion(command, v, output);
    return;
  }
  if (provider === "chrome" && positionals.length === 2) {
    await runChrome(command, v, output);
    return;
  }
  if (provider !== "play" || positionals.length !== 2 || !command || !["plan", "inspect", "status", "wait", "upload", "validate", "submit"].includes(command)) throw new PlayError("ARGUMENT", "Unknown command. Run --help.");
  const allowed: Record<string, string[]> = {
    plan: ["manifest", "bundletool", "java", "jarsigner", "keytool"],
    upload: ["manifest", "bundletool", "java", "jarsigner", "keytool", "state-dir", "execute"],
    inspect: ["package", "track", "state-dir", "execute"],
    status: ["package", "track", "version-code"],
    wait: ["package", "track", "version-code", "timeout"],
    validate: ["manifest", "state-dir", "execute"], submit: ["manifest", "state-dir", "execute"],
  };
  if (Object.keys(v).some(k => !allowed[command]!.includes(k))) throw new PlayError("ARGUMENT", "An option is not supported by this command.");
  const play = new GooglePlay(new GoogleTransport());
  if (command === "status" || command === "wait") {
    const pkg = required(v.package, "package"), track = required(v.track, "track");
    const version = v["version-code"];
    if (version !== undefined && !/^[1-9]\d*$/.test(version)) throw new PlayError("ARGUMENT", "Invalid version code.");
    if (command === "status") { output(await play.status(pkg, track, version)); return; }
    const timeout = Number(v.timeout ?? 300);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) throw new PlayError("ARGUMENT", "Timeout must be 1 to 3600 seconds.");
    const result = await play.wait(pkg, track, required(version, "version-code"), timeout * 1000);
    output(result);
    if (result.timedOut) process.exitCode = 3;
    return;
  }
  if (command !== "plan" && !v.execute) throw new PlayError("EXECUTION_REQUIRED", "This command requires --execute. Use plan for offline artifact verification or status for a read-only query.");
  const manifestPath = command === "inspect" ? undefined : resolve(required(v.manifest, "manifest"));
  const manifest = manifestPath ? parseManifest(JSON.parse(await readFile(manifestPath, "utf8"))) : undefined;
  if (manifest && manifestPath) manifest.artifact = resolve(dirname(manifestPath), manifest.artifact);
  const pkg = manifest?.packageName ?? required(v.package, "package");
  const track = manifest?.track ?? required(v.track, "track");
  target(pkg, track);
  const verify = () => verifyArtifact(manifest!, { bundletool: resolve(required(v.bundletool, "bundletool")), java: v.java, jarsigner: v.jarsigner, keytool: v.keytool });
  if (command === "plan") {
    await verify();
    output({ provider: "google-play", packageName: pkg, track, versionName: manifest!.versionName, versionCode: manifest!.versionCode, sha256: manifest!.sha256, offline: true, verified: true, rollout: "completed", expectedConfigurationSha256: manifest!.expectedConfigurationSha256 });
    return;
  }
  const stateDir = resolve(v["state-dir"] ?? ".play-state");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const statePath = join(stateDir, `${pkg}.json`);
  const lockPath = join(stateDir, `${pkg}.lock`);
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new PlayError("LOCKED", "An operation lock exists for this package. Inspect it and reconcile state before removing a stale lock."); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, command, startedAt: new Date().toISOString() }));
    const save = async (journal: Journal) => {
      const temp = `${statePath}.tmp`;
      const file = await open(temp, "w", 0o600);
      try { await file.writeFile(JSON.stringify(journal)); await file.sync(); } finally { await file.close(); }
      await rename(temp, statePath);
    };
    if (command === "upload" || command === "inspect") {
      let exists = false;
      try { await access(statePath); exists = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      if (exists) throw new PlayError("EXISTING_JOURNAL", "A journal exists for this package. Resume it or reconcile and archive it before creating a new edit.");
      if (command === "inspect") { output(await play.inspect(pkg, track)); return; }
      const journal = await play.upload(manifest!, await verify(), save);
      output({ phase: journal.phase, editId: journal.editId, expiresAt: journal.expiresAt, packageName: pkg, versionCode: manifest!.versionCode });
      return;
    }
    const journal = JSON.parse(await readFile(statePath, "utf8")) as Journal;
    if (canonical(journal.manifest) !== canonical(manifest)) throw new PlayError("MANIFEST_CHANGED", "The manifest differs from the saved upload. Restore the reviewed manifest before resuming.");
    if (command === "validate") {
      await play.validate(journal, save);
      output({ phase: journal.phase, editId: journal.editId, packageName: pkg, versionCode: manifest!.versionCode });
    } else output(await play.submit(journal, save));
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch(error => {
  const chrome = chromeErrorResult(error);
  if (chrome) {
    output({ error: chrome });
    process.exitCode = 1;
    return;
  }
  const safe = error instanceof PlayError ? error : new PlayError("LOCAL_ERROR", "The command could not complete. Check arguments, files and tool installation. Raw error details are withheld to protect credentials.");
  output({ error: { code: safe.code, message: safe.message, uncertain: safe.uncertain } });
  process.exitCode = 1;
});
