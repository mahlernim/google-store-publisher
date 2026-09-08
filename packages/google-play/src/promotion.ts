import { canonical, target } from "./manifest.js";
import { PlayError, type Transport } from "./transport.js";

export interface PromotionManifest {
  packageName: string;
  sourceTrack: string;
  destinationTracks: string[];
  versionCode: string;
  sha256: string;
}
type Release = Record<string, unknown> & { status?: string; versionCodes?: string[] };
type Track = { track: string; releases?: Release[] };
export interface PromotionJournal {
  schema: 1;
  operation: "promotion";
  manifest: PromotionManifest;
  phase: "creating" | "prepared" | "validating" | "validated" | "committing" | "committed";
  editId?: string;
  baseline?: Track[];
  desired?: Track[];
}
export type PromotionSave = (journal: PromotionJournal) => Promise<void>;
function fail(code: string, message: string): never { throw new PlayError(code, message); }
export function parsePromotion(value: unknown): PromotionManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_MANIFEST", "Expected a promotion manifest.");
  const m = value as PromotionManifest;
  const fields = ["packageName", "sourceTrack", "destinationTracks", "versionCode", "sha256"];
  if (Object.keys(m).length !== fields.length || Object.keys(m).some(k => !fields.includes(k)) ||
      [m.packageName, m.sourceTrack, m.versionCode, m.sha256].some(v => typeof v !== "string") ||
      !Array.isArray(m.destinationTracks) || !m.destinationTracks.length || m.destinationTracks.some(t => typeof t !== "string") ||
      new Set(m.destinationTracks).size !== m.destinationTracks.length ||
      !/^[1-9]\d*$/.test(m.versionCode) || BigInt(m.versionCode) > 2100000000n || !/^[a-f0-9]{64}$/.test(m.sha256)) fail("INVALID_MANIFEST", "Invalid promotion manifest fields.");
  target(m.packageName, m.sourceTrack);
  for (const t of m.destinationTracks) {
    target(m.packageName, t);
    if (t.toLowerCase() === "production" || t === m.sourceTrack) fail("INVALID_TARGET", "Promotion destinations must be distinct existing testing tracks, not the source.");
  }
  return m;
}
const comparable = (tracks: Track[]) => canonical([...tracks].sort((a, b) => a.track.localeCompare(b.track)).map(t => ({
  ...t, releases: (t.releases ?? []).map(r => {
    const copy = { ...r };
    if (copy.inAppUpdatePriority === 0) delete copy.inAppUpdatePriority;
    if (Array.isArray(copy.releaseNotes)) copy.releaseNotes = [...copy.releaseNotes].sort((a, b) => String(a.language).localeCompare(String(b.language)));
    return copy;
  }),
})));

/** Existing-bundle promotion only. No artifact upload, tester or country writes. */
export class GooglePlayPromotion {
  constructor(private readonly api: Transport) {}
  private app(m: PromotionManifest) { return `applications/${encodeURIComponent(m.packageName)}`; }
  private path(j: PromotionJournal) {
    if (!j.editId || !/^[\w-]+$/.test(j.editId)) fail("INVALID_EDIT", "Promotion journal has no valid edit ID.");
    return `${this.app(j.manifest)}/edits/${j.editId}`;
  }
  async preflight(m: PromotionManifest, tracks = [...new Set(["production", "internal", "alpha", "beta", m.sourceTrack, ...m.destinationTracks])]) {
    parsePromotion(m);
    for (const track of tracks) {
      const result = await this.api.request<{ releases?: { track: string; releaseLifecycleState: string; activeArtifacts?: { versionCode: number }[] }[] }>({ method: "GET", path: `${this.app(m)}/tracks/${encodeURIComponent(track)}/releases` });
      if (!result || (result.releases !== undefined && !Array.isArray(result.releases))) fail("INVALID_RESPONSE", "Invalid lifecycle response.");
      for (const r of result.releases ?? []) {
        if (!r || r.track !== track || r.releaseLifecycleState !== "RELEASE_LIFECYCLE_STATE_PUBLISHED") fail("REVIEW_CONFLICT", "Resolve unpublished, rejected, draft or unknown releases before promotion.");
      }
      if (track === m.sourceTrack && !(result.releases ?? []).some(r => r.activeArtifacts?.some(a => String(a.versionCode) === m.versionCode))) fail("SOURCE_MISMATCH", "Exact source version is not published on the selected track.");
    }
  }
  private async tracks(j: PromotionJournal) {
    const result = await this.api.request<{ tracks?: Track[] }>({ method: "GET", path: `${this.path(j)}/tracks` });
    if (!result || !Array.isArray(result.tracks) || result.tracks.some(t => !t || typeof t.track !== "string" || (t.releases !== undefined && !Array.isArray(t.releases))) || new Set(result.tracks.map(t => t.track)).size !== result.tracks.length) fail("INVALID_RESPONSE", "Invalid track inventory.");
    for (const t of result.tracks) target(j.manifest.packageName, t.track);
    for (const t of [j.manifest.sourceTrack, ...j.manifest.destinationTracks]) if (!result.tracks.some(v => v.track === t)) fail("TARGET_MISMATCH", "A requested track does not exist.");
    return result.tracks;
  }
  private desired(m: PromotionManifest, baseline: Track[]): Track[] {
    const source = baseline.find(t => t.track === m.sourceTrack)?.releases ?? [];
    const matches = source.filter(r => r.status === "completed" && r.versionCodes?.length === 1 && r.versionCodes[0] === m.versionCode);
    if (matches.length !== 1) fail("SOURCE_MISMATCH", "Source must contain one unambiguous completed single-bundle release matching the exact version.");
    const release = matches[0]!;
    const allowed = ["name", "versionCodes", "releaseNotes", "status", "inAppUpdatePriority", "countryTargeting"];
    if (Object.keys(release).some(k => !allowed.includes(k))) fail("TRACK_CONFLICT", "Source contains unsupported release fields.");
    return baseline.map(t => {
      if (!m.destinationTracks.includes(t.track)) return structuredClone(t);
      const existing = t.releases ?? [];
      if (existing.length > 1 || existing.some(r => !r || r.status !== "completed" || !Array.isArray(r.versionCodes) || r.versionCodes.length !== 1 || !/^[1-9]\d*$/.test(r.versionCodes[0]!) || BigInt(r.versionCodes[0]!) >= BigInt(m.versionCode) || Object.keys(r).some(k => !allowed.includes(k)))) fail("TRACK_CONFLICT", "Destination is ambiguous, staged, already current, newer or contains unsupported fields.");
      const next = structuredClone(release);
      delete next.countryTargeting;
      if (existing[0]?.countryTargeting !== undefined) next.countryTargeting = structuredClone(existing[0].countryTargeting);
      return { ...t, releases: [next] };
    });
  }
  private async bundle(j: PromotionJournal) {
    const result = await this.api.request<{ bundles?: { versionCode: number; sha256: string }[] }>({ method: "GET", path: `${this.path(j)}/bundles` });
    const matches = result.bundles?.filter(b => String(b.versionCode) === j.manifest.versionCode) ?? [];
    if (matches.length !== 1 || matches[0]?.sha256?.toLowerCase() !== j.manifest.sha256) fail("BUNDLE_MISMATCH", "Existing bundle does not match the exact version and reviewed SHA-256.");
  }
  async prepare(manifest: PromotionManifest, save: PromotionSave) {
    const m = parsePromotion(manifest);
    await this.preflight(m);
    const j: PromotionJournal = { schema: 1, operation: "promotion", manifest: m, phase: "creating" };
    await save(j);
    const edit = await this.api.request<{ id: string }>({ method: "POST", path: `${this.app(m)}/edits`, body: {} });
    j.editId = edit.id;
    await save(j);
    const baseline = await this.tracks(j);
    await this.preflight(m, baseline.map(t => t.track));
    await this.bundle(j);
    j.baseline = baseline;
    j.desired = this.desired(m, baseline);
    j.phase = "prepared";
    await save(j);
    return j;
  }
  private async verify(j: PromotionJournal, staged: boolean) {
    parsePromotion(j.manifest);
    if (j.schema !== 1 || j.operation !== "promotion" || !Array.isArray(j.baseline) || !Array.isArray(j.desired) || comparable(this.desired(j.manifest, j.baseline)) !== comparable(j.desired)) fail("INVALID_JOURNAL", "Promotion baseline or desired state is invalid.");
    const edit = await this.api.request<{ id: string; expiryTimeSeconds: string }>({ method: "GET", path: this.path(j) });
    if (edit.id !== j.editId || !Number.isFinite(Number(edit.expiryTimeSeconds)) || Number(edit.expiryTimeSeconds) * 1000 <= Date.now()) fail("EXPIRED_EDIT", "Promotion edit expired or is invalid.");
    const current = await this.tracks(j);
    await this.preflight(j.manifest, current.map(t => t.track));
    await this.bundle(j);
    if (comparable(current) !== comparable(staged ? j.desired : j.baseline)) fail("TRACK_CHANGED", "Track state differs from the reviewed promotion journal.");
  }
  async validate(j: PromotionJournal, save: PromotionSave) {
    if (j.phase !== "prepared") fail("INVALID_PHASE", "Validation requires prepared state. Reconcile interrupted mutations first.");
    await this.verify(j, false);
    j.phase = "validating";
    await save(j);
    for (const t of j.desired!.filter(t => j.manifest.destinationTracks.includes(t.track))) await this.api.request({ method: "PUT", path: `${this.path(j)}/tracks/${encodeURIComponent(t.track)}`, body: t });
    await this.api.request({ method: "POST", path: `${this.path(j)}:validate` });
    await this.verify(j, true);
    j.phase = "validated";
    await save(j);
    return j;
  }
  async submit(j: PromotionJournal, save: PromotionSave) {
    if (j.phase !== "validated") fail("INVALID_PHASE", "Submission requires validated state. Never retry an uncertain commit.");
    await this.verify(j, true);
    j.phase = "committing";
    await save(j);
    await this.api.request({ method: "POST", path: `${this.path(j)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW` });
    j.phase = "committed";
    await save(j);
    return j;
  }
}
