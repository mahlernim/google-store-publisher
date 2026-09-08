import { GooglePlay, GooglePlayPromotion, GoogleTransport, PlayError, parsePromotion, canonical, type PromotionJournal } from "@google-store-publisher/google-play";
import { mkdir, open, readFile, rename, unlink, access } from "node:fs/promises";
import { resolve, join } from "node:path";

export async function runPromotion(command: string, v: Record<string, string | boolean | undefined>, output: (value: unknown) => void) {
  const allowed = command === "promote-plan" ? ["manifest"] : ["manifest", "state-dir", "execute"];
  if (!["promote-plan", "promote-prepare", "promote-validate", "promote-submit"].includes(command) || Object.keys(v).some(k => !allowed.includes(k))) throw new PlayError("ARGUMENT", "Unsupported promotion command or option.");
  if (typeof v.manifest !== "string") throw new PlayError("ARGUMENT", "Missing --manifest.");
  const manifest = parsePromotion(JSON.parse(await readFile(resolve(v.manifest), "utf8")));
  if (command === "promote-plan") {
    output({ provider: "google-play", operation: "promotion", manifest, offline: true, changed: false, remoteVerified: false, rollout: "completed" });
    return;
  }
  if (!v.execute) throw new PlayError("EXECUTION_REQUIRED", "Promotion mutations require --execute. Use promote-plan for an offline preview.");
  const stateDir = resolve(typeof v["state-dir"] === "string" ? v["state-dir"] : ".play-state");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const path = join(stateDir, `${manifest.packageName}.json`);
  const lockPath = join(stateDir, `${manifest.packageName}.lock`);
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new PlayError("LOCKED", "An app operation lock exists. Reconcile before removing it."); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, command, startedAt: new Date().toISOString() }));
    const save = async (j: PromotionJournal) => {
      const file = await open(`${path}.tmp`, "w", 0o600);
      try { await file.writeFile(JSON.stringify(j)); await file.sync(); } finally { await file.close(); }
      await rename(`${path}.tmp`, path);
    };
    const api = new GoogleTransport();
    const promotion = new GooglePlayPromotion(api);
    let journal: PromotionJournal;
    if (command === "promote-prepare") {
      try { await access(path); throw new PlayError("EXISTING_JOURNAL", "An app journal exists. Reconcile and archive it before creating another edit."); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      journal = await promotion.prepare(manifest, save);
    } else {
      journal = JSON.parse(await readFile(path, "utf8")) as PromotionJournal;
      if (journal.operation !== "promotion" || canonical(journal.manifest) !== canonical(manifest)) throw new PlayError("MANIFEST_CHANGED", "The promotion manifest differs from the journal.");
      if (command === "promote-validate") await promotion.validate(journal, save);
      else await promotion.submit(journal, save);
    }
    output({ phase: journal.phase, editId: journal.editId, manifest, ...(command === "promote-prepare" ? { baseline: journal.baseline, desired: journal.desired } : {}) });
    if (command === "promote-submit") {
      const play = new GooglePlay(api);
      for (const track of [...new Set(["production", manifest.sourceTrack, ...manifest.destinationTracks])]) {
        output(await play.status(manifest.packageName, track));
      }
    }
  } finally { await lock.close(); await unlink(lockPath); }
}
