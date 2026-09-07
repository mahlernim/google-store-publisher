import { createHash } from "node:crypto";
import { PlayError } from "./transport.js";

export interface Manifest {
  packageName: string;
  track: string;
  versionName: string;
  versionCode: string;
  artifact: string;
  sha256: string;
  uploadCertificateSha256: string;
  releaseNotes: { language: string; text: string }[];
  expectedConfigurationSha256: string;
}
export const digest = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
export function target(packageName: string, track: string): void {
  if (!/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(packageName) || !/^[\w.-]+$/.test(track)) {
    throw new PlayError("INVALID_TARGET", "An exact package name and track identifier are required.");
  }
}
export function parseManifest(value: unknown): Manifest {
  const bad = () => new PlayError("INVALID_MANIFEST", "Invalid release manifest. See the Google Play JSON example and required fields.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad();
  const m = value as Manifest;
  const fields = ["packageName", "track", "versionName", "versionCode", "artifact", "sha256", "uploadCertificateSha256", "releaseNotes", "expectedConfigurationSha256"];
  if (Object.keys(m).some(k => !fields.includes(k)) || fields.some(k => !(k in m))) throw bad();
  for (const k of fields.filter(k => k !== "releaseNotes")) if (typeof (m as unknown as Record<string, unknown>)[k] !== "string" || !(m as unknown as Record<string, string>)[k]) throw bad();
  target(m.packageName, m.track);
  // This version is deliberately limited to existing testing tracks.
  if (["production"].includes(m.track.toLowerCase())) throw new PlayError("PRODUCTION_DISABLED", "This provider supports testing-track releases only.");
  if (!/^[1-9]\d*$/.test(m.versionCode) || BigInt(m.versionCode) > 2100000000n || !m.artifact.endsWith(".aab")) throw bad();
  if ([m.sha256, m.uploadCertificateSha256, m.expectedConfigurationSha256].some(h => !/^[a-f0-9]{64}$/.test(h))) throw bad();
  if (!Array.isArray(m.releaseNotes) || !m.releaseNotes.length || m.releaseNotes.some(n => !n || typeof n.language !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(n.language) || typeof n.text !== "string" || !n.text.trim() || [...n.text].length > 500 || Object.keys(n).some(k => !["language", "text"].includes(k)))) throw bad();
  if (new Set(m.releaseNotes.map(n => n.language)).size !== m.releaseNotes.length) throw bad();
  return m;
}
