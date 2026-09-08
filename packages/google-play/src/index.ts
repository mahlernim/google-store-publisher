import { canonical, digest, parseManifest, target, type Manifest } from "./manifest.js";
import { PlayError, type Transport } from "./transport.js";
export * from "./manifest.js";
export * from "./transport.js";
export * from "./artifact.js";
export * from "./promotion.js";

type ObjectData = Record<string, unknown>;
interface Track extends ObjectData { track: string; releases?: ObjectData[] }
interface Bundle { versionCode: number; sha256: string }
interface Summary { releaseName?: string; track: string; activeArtifacts?: { versionCode: number }[]; releaseLifecycleState: string }
export interface Journal {
  schema: 1;
  manifest: Manifest;
  phase: "creating" | "uploading" | "uploaded" | "validating" | "validated" | "committing" | "committed";
  editId?: string;
  expiresAt?: string;
  baseTrack?: Track;
}
export type Save = (journal: Journal) => Promise<void>;
const enc = encodeURIComponent;
const app = (m: Pick<Manifest, "packageName">) => `applications/${enc(m.packageName)}`;
const known = new Set(["DRAFT", "NOT_SENT_FOR_REVIEW", "IN_REVIEW", "APPROVED_NOT_PUBLISHED", "NOT_APPROVED", "PUBLISHED"]);
export function normalizedState(native: string): string {
  return ({ DRAFT: "draft", NOT_SENT_FOR_REVIEW: "ready-for-review", IN_REVIEW: "in-review", APPROVED_NOT_PUBLISHED: "approved", NOT_APPROVED: "rejected", PUBLISHED: "published" } as Record<string, string>)[native.replace("RELEASE_LIFECYCLE_STATE_", "")] ?? "unknown";
}
function fail(code: string, message: string): never { throw new PlayError(code, message); }
function comparable(track: Track): string {
  return canonical({ ...track, releases: track.releases?.map(r => {
    const copy = { ...r };
    if (copy.inAppUpdatePriority === 0) delete copy.inAppUpdatePriority;
    if (Array.isArray(copy.releaseNotes)) copy.releaseNotes = [...copy.releaseNotes].sort((a, b) => String(a.language).localeCompare(String(b.language)));
    return copy;
  }) });
}

export class GooglePlay {
  constructor(private readonly api: Transport) {}
  private async summaries(packageName: string, track: string): Promise<Summary[]> {
    target(packageName, track);
    const result = await this.api.request<{ releases?: Summary[] }>({ method: "GET", path: `applications/${enc(packageName)}/tracks/${enc(track)}/releases` });
    if (!result || (result.releases !== undefined && !Array.isArray(result.releases))) fail("INVALID_RESPONSE", "Invalid release lifecycle response.");
    const releases = result.releases ?? [];
    if (releases.some(r => !r || r.track !== track || typeof r.releaseLifecycleState !== "string" || (r.activeArtifacts !== undefined && (!Array.isArray(r.activeArtifacts) || r.activeArtifacts.some(a => !Number.isSafeInteger(a.versionCode) || a.versionCode <= 0))))) fail("INVALID_RESPONSE", "Release lifecycle identity or artifacts are invalid.");
    return releases;
  }
  async status(packageName: string, track: string, versionCode?: string) {
    const releases = await this.summaries(packageName, track);
    return { provider: "google-play", packageName, track, observedAt: new Date().toISOString(), changed: false,
      releases: releases.filter(r => !versionCode || r.activeArtifacts?.some(a => String(a.versionCode) === versionCode)).map(r => ({ ...r, normalizedState: normalizedState(r.releaseLifecycleState) })) };
  }
  private async guard(m: Manifest): Promise<void> {
    const releases = await this.summaries(m.packageName, m.track);
    for (const r of releases) {
      const state = r.releaseLifecycleState.replace("RELEASE_LIFECYCLE_STATE_", "");
      if (!known.has(state) || !["PUBLISHED"].includes(state)) fail("REVIEW_CONFLICT", "The target has an unpublished, rejected, pending or unknown release. Resolve it before starting another edit.");
    }
  }
  private path(j: Journal): string {
    if (!j.editId || !/^[\w-]+$/.test(j.editId)) fail("INVALID_EDIT", "The journal does not identify a valid edit.");
    return `${app(j.manifest)}/edits/${enc(j.editId)}`;
  }
  private async guardAllTracks(j: Journal) {
    const list = await this.api.request<{ tracks?: Track[] }>({ method: "GET", path: `${this.path(j)}/tracks` });
    if (!Array.isArray(list.tracks) || !list.tracks.some(t => t.track === j.manifest.track)) fail("TARGET_MISMATCH", "The existing target track was not found.");
    for (const t of list.tracks) await this.guard({ ...j.manifest, track: t.track });
  }
  private async configuration(path: string, track: string) {
    const testers = await this.api.request<{ googleGroups?: string[] }>({ method: "GET", path: `${path}/testers/${enc(track)}` });
    const countries = await this.api.request<{ countries?: { countryCode: string }[]; restOfWorld?: boolean; syncWithProduction?: boolean }>({ method: "GET", path: `${path}/countryAvailability/${enc(track)}` });
    if (!testers || !countries || (testers.googleGroups !== undefined && (!Array.isArray(testers.googleGroups) || testers.googleGroups.some(g => typeof g !== "string"))) || (countries.countries !== undefined && (!Array.isArray(countries.countries) || countries.countries.some(c => !c || typeof c.countryCode !== "string")))) fail("INVALID_RESPONSE", "Invalid tester or country configuration.");
    const configuration = {
      googleGroups: [...(testers.googleGroups ?? [])].sort(),
      countries: (countries.countries ?? []).map(c => c.countryCode).sort(),
      restOfWorld: countries.restOfWorld ?? false,
      syncWithProduction: countries.syncWithProduction ?? false,
    };
    return { configurationSha256: digest(canonical(configuration)), googleGroupCount: configuration.googleGroups.length, countryCount: configuration.countries.length, restOfWorld: configuration.restOfWorld, syncWithProduction: configuration.syncWithProduction,
      testerCoverage: "Google Groups only. Play Console individual email lists are not exposed by this API." };
  }
  /** Creates then deletes a temporary edit. This is not a pure read operation. */
  async inspect(packageName: string, track: string) {
    target(packageName, track);
    const edit = await this.api.request<{ id: string }>({ method: "POST", path: `applications/${enc(packageName)}/edits`, body: {} });
    if (!edit?.id || !/^[\w-]+$/.test(edit.id)) fail("INVALID_EDIT", "Google did not return an edit ID.");
    const path = `applications/${enc(packageName)}/edits/${enc(edit.id)}`;
    try {
      const current = await this.api.request<Track>({ method: "GET", path: `${path}/tracks/${enc(track)}` });
      if (current.track !== track) fail("TARGET_MISMATCH", "Google returned a different track.");
      return { provider: "google-play", packageName, track, ...await this.configuration(path, track), releases: current.releases ?? [], temporaryEdit: true };
    } finally {
      await this.api.request({ method: "DELETE", path });
    }
  }
  async upload(manifest: Manifest, bytes: Uint8Array, save: Save): Promise<Journal> {
    const m = parseManifest(manifest);
    if (digest(bytes) !== m.sha256) fail("ARTIFACT_MISMATCH", "Upload bytes do not match the manifest digest.");
    await this.guard(m);
    const j: Journal = { schema: 1, manifest: m, phase: "creating" };
    await save(j);
    const edit = await this.api.request<{ id: string; expiryTimeSeconds: string }>({ method: "POST", path: `${app(m)}/edits`, body: {} });
    j.editId = edit.id;
    j.expiresAt = edit.expiryTimeSeconds;
    await save(j);
    const path = this.path(j);
    await this.guardAllTracks(j);
    const configuration = await this.configuration(path, m.track);
    if (configuration.configurationSha256 !== m.expectedConfigurationSha256) fail("CONFIGURATION_CHANGED", "Tester groups or country configuration differ from the inspected baseline.");
    const current = await this.api.request<Track>({ method: "GET", path: `${path}/tracks/${enc(m.track)}` });
    if (current.track !== m.track || (current.releases?.length ?? 0) > 1 || current.releases?.some(r => r.status !== "completed")) fail("TRACK_CONFLICT", "The track must have at most one completed release. Multiple artifacts or an active staged rollout require separate handling.");
    const releases = current.releases ?? [];
    if (releases.some(r => !Array.isArray(r.versionCodes) || r.versionCodes.length !== 1)) fail("TRACK_CONFLICT", "Existing multi-artifact releases are not supported by this command.");
    const bundles = await this.api.request<{ bundles?: Bundle[] }>({ method: "GET", path: `${path}/bundles` });
    const apks = await this.api.request<{ apks?: { versionCode: number }[] }>({ method: "GET", path: `${path}/apks` });
    const codes = [...(bundles.bundles ?? []), ...(apks.apks ?? [])].map(b => b.versionCode);
    if (codes.some(c => !Number.isSafeInteger(c) || c >= Number(m.versionCode))) fail("VERSION_CONFLICT", "The new version code must exceed all APK and bundle codes returned by Play. Google also rejects previously used codes.");
    j.baseTrack = current;
    j.phase = "uploading";
    await save(j);
    const uploaded = await this.api.request<Bundle>({ method: "POST", path: `${path}/bundles?uploadType=media`, media: bytes });
    if (String(uploaded.versionCode) !== m.versionCode || uploaded.sha256?.toLowerCase() !== m.sha256) fail("UPLOAD_MISMATCH", "Google returned a different version code or bundle digest. The edit was not committed.");
    j.phase = "uploaded";
    await save(j);
    return j;
  }
  private desired(j: Journal): Track {
    const old = j.baseTrack?.releases?.[0];
    return { track: j.manifest.track, releases: [{ name: j.manifest.versionName, versionCodes: [j.manifest.versionCode], releaseNotes: j.manifest.releaseNotes, status: "completed", ...(old?.countryTargeting ? { countryTargeting: old.countryTargeting } : {}) }] };
  }
  private async verifyEdit(j: Journal, desired: boolean): Promise<void> {
    parseManifest(j.manifest);
    if (j.schema !== 1 || !j.baseTrack || j.baseTrack.track !== j.manifest.track) fail("INVALID_JOURNAL", "Journal baseline is missing or mismatched.");
    const path = this.path(j);
    const edit = await this.api.request<{ id: string; expiryTimeSeconds: string }>({ method: "GET", path });
    if (edit.id !== j.editId || !Number.isFinite(Number(edit.expiryTimeSeconds)) || Number(edit.expiryTimeSeconds) * 1000 <= Date.now()) fail("EXPIRED_EDIT", "The saved edit is expired or invalid.");
    await this.guardAllTracks(j);
    const configuration = await this.configuration(path, j.manifest.track);
    if (configuration.configurationSha256 !== j.manifest.expectedConfigurationSha256) fail("CONFIGURATION_CHANGED", "Tester groups or countries changed.");
    const bundles = await this.api.request<{ bundles?: Bundle[] }>({ method: "GET", path: `${path}/bundles` });
    if (!bundles.bundles?.some(b => String(b.versionCode) === j.manifest.versionCode && b.sha256?.toLowerCase() === j.manifest.sha256)) fail("BUNDLE_MISMATCH", "The saved edit does not contain the verified bundle.");
    const current = await this.api.request<Track>({ method: "GET", path: `${path}/tracks/${enc(j.manifest.track)}` });
    if (comparable(current) !== comparable(desired ? this.desired(j) : j.baseTrack)) fail("TRACK_CHANGED", "The saved edit's track differs from the expected release.");
  }
  async validate(j: Journal, save: Save): Promise<Journal> {
    if (j.phase !== "uploaded") fail("INVALID_PHASE", "Validation requires an uploaded journal. An interrupted operation must be reconciled first.");
    await this.guard(j.manifest);
    await this.verifyEdit(j, false);
    j.phase = "validating";
    await save(j);
    await this.api.request({ method: "PUT", path: `${this.path(j)}/tracks/${enc(j.manifest.track)}`, body: this.desired(j) });
    await this.api.request({ method: "POST", path: `${this.path(j)}:validate` });
    await this.verifyEdit(j, true);
    j.phase = "validated";
    await save(j);
    return j;
  }
  async submit(j: Journal, save: Save) {
    if (j.phase !== "validated") fail("INVALID_PHASE", "Submission requires a validated journal. Never retry an interrupted commit blindly.");
    await this.guard(j.manifest);
    await this.verifyEdit(j, true);
    j.phase = "committing";
    await save(j);
    await this.api.request({ method: "POST", path: `${this.path(j)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW` });
    j.phase = "committed";
    await save(j);
    return { committed: true, editId: j.editId, ...await this.status(j.manifest.packageName, j.manifest.track, j.manifest.versionCode), changed: true };
  }
  async wait(packageName: string, track: string, versionCode: string, timeoutMs = 300_000, intervalMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const result = await this.status(packageName, track, versionCode);
      if (result.releases.some(r => r.normalizedState === "rejected")) fail("REJECTED", "The requested release was rejected.");
      if (result.releases.some(r => r.normalizedState === "published")) return { ...result, timedOut: false };
      if (Date.now() >= deadline) return { ...result, timedOut: true };
      await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
    }
  }
}
