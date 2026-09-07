import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

export interface ChromeArtifact {
  bytes: Buffer;
  path: string;
  sha256: string;
  sizeBytes: number;
  version: string;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimumOffset = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("Artifact is not a valid ZIP file");
}

function readRootManifest(zip: Buffer): Buffer {
  const endOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(endOffset + 10);
  let offset = zip.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error("Artifact has an invalid ZIP central directory");
    }
    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (name === "manifest.json") {
      if (zip.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
        throw new Error("Artifact has an invalid manifest entry");
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) {
        return compressed;
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressed);
      }
      throw new Error(`Unsupported manifest compression method ${compressionMethod}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Artifact must contain manifest.json at the ZIP root");
}

export async function inspectChromeArtifact(path: string): Promise<ChromeArtifact> {
  if (!path.toLowerCase().endsWith(".zip")) {
    throw new Error("Chrome Web Store artifact must be a ZIP file");
  }
  const bytes = await readFile(path);
  const manifestBytes = readRootManifest(bytes);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error("Packaged manifest.json must declare a version");
  }
  return {
    bytes,
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    version: manifest.version,
  };
}
