import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { digest, type Manifest } from "./manifest.js";
import { PlayError } from "./transport.js";

const execute = promisify(execFile);
export interface ArtifactTools { bundletool: string; java?: string; jarsigner?: string; keytool?: string }

/** Verify the same bytes subsequently uploaded. No shell interpolation. */
export async function verifyArtifact(m: Manifest, tools: ArtifactTools, run: (program: string, args: string[]) => Promise<string> = async (program, args) => (await execute(program, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })).stdout.trim()): Promise<Uint8Array> {
  try {
    const bytes = await readFile(m.artifact);
    if (digest(bytes) !== m.sha256) throw new Error();
    for (const [xpath, expected] of [["/manifest/@package", m.packageName], ["/manifest/@android:versionName", m.versionName], ["/manifest/@android:versionCode", m.versionCode]]) {
      const actual = await run(tools.java ?? "java", ["-jar", tools.bundletool, "dump", "manifest", `--bundle=${m.artifact}`, `--xpath=${xpath}`]);
      if (actual !== expected) throw new Error();
    }
    const signature = await run(tools.jarsigner ?? "jarsigner", ["-J-Duser.language=en", "-J-Duser.country=US", "-verify", "-verbose", "-certs", m.artifact]);
    if (!signature.includes("jar verified.") || /unsigned entries|jar is unsigned|treated as unsigned/i.test(signature)) throw new Error();
    const certificates = await run(tools.keytool ?? "keytool", ["-printcert", "-jarfile", m.artifact, "-rfc"]);
    const pems = certificates.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    // Multiple signer/chain identities need explicit handling, not an any-match rule.
    if (pems.length !== 1 || digest(new X509Certificate(pems[0]!).raw) !== m.uploadCertificateSha256) throw new Error();
    if (digest(await readFile(m.artifact)) !== m.sha256) throw new Error();
    return bytes;
  } catch {
    throw new PlayError("ARTIFACT_VERIFICATION", "AAB verification failed. Check its digest, embedded package/version, full JAR signature, upload certificate, JDK tools and bundletool.");
  }
}
