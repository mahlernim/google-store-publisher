import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { NormalizedReleaseState } from "@google-store-publisher/core";

export { inspectChromeArtifact, type ChromeArtifact } from "./artifact.js";

const execFileAsync = promisify(execFile);
const API_ROOT = "https://chromewebstore.googleapis.com";
const CWS_SCOPE = "https://www.googleapis.com/auth/chromewebstore";

export interface ChromeWebStoreConfig {
  itemId: string;
  publisherId: string;
  projectId?: string;
  serviceAccount?: string;
}

export interface DistributionChannel {
  crxVersion?: string;
  deployPercentage?: number;
}

export interface ItemRevisionStatus {
  distributionChannels?: DistributionChannel[];
  state?: string;
}

export interface ChromeWebStoreStatus {
  itemId?: string;
  lastAsyncUploadState?: string;
  name?: string;
  publishedItemRevisionStatus?: ItemRevisionStatus;
  submittedItemRevisionStatus?: ItemRevisionStatus;
  takenDown?: boolean;
  warned?: boolean;
}

export interface PublishOptions {
  allowWarnings?: boolean;
  skipReview?: boolean;
  staged?: boolean;
}

export type AccessTokenProvider = () => Promise<string>;
export type FetchImplementation = typeof fetch;

export class ChromeWebStoreApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
  ) {
    super(`Chrome Web Store API request failed with HTTP ${status}: ${reason}`);
    this.name = "ChromeWebStoreApiError";
  }
}

function requiredIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._@-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return trimmed;
}

async function firstExistingPath(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Continue to the next known installation location.
    }
  }
  return undefined;
}

async function resolveGcloud(): Promise<string> {
  if (process.platform !== "win32") {
    return "gcloud";
  }
  const candidates = [
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
    process.env.ProgramFiles &&
      join(process.env.ProgramFiles, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
    process.env["ProgramFiles(x86)"] &&
      join(process.env["ProgramFiles(x86)"], "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return (await firstExistingPath(candidates)) ?? "gcloud.cmd";
}

export async function getChromeWebStoreAccessToken(
  config: Pick<ChromeWebStoreConfig, "projectId" | "serviceAccount">,
): Promise<string> {
  const injected = process.env.CWS_ACCESS_TOKEN?.trim();
  if (injected) {
    return injected;
  }
  if (!config.serviceAccount) {
    throw new Error(
      "Missing Chrome Web Store credentials. Set CWS_ACCESS_TOKEN or configure a service account",
    );
  }
  const serviceAccount = requiredIdentifier(config.serviceAccount, "Service account");
  const args = [
    "auth",
    "print-access-token",
    `--impersonate-service-account=${serviceAccount}`,
    `--scopes=${CWS_SCOPE}`,
  ];
  if (config.projectId) {
    args.push(`--project=${requiredIdentifier(config.projectId, "Project ID")}`);
  }
  const executable = await resolveGcloud();
  const invocation =
    process.platform === "win32"
      ? {
          command: process.env.ComSpec ?? "cmd.exe",
          args: ["/d", "/s", "/c", `"${executable}" ${args.join(" ")}`],
        }
      : { command: executable, args };
  try {
    const { stdout } = await execFileAsync(invocation.command, invocation.args, {
      encoding: "utf8",
      windowsHide: true,
    });
    const token = stdout.trim();
    if (!token) {
      throw new Error("Google Cloud CLI returned an empty access token");
    }
    return token;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    throw new Error(`Could not obtain a short-lived access token from Google Cloud CLI (${code})`);
  }
}

function safeApiReason(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "provider error";
  }
  const error = "error" in value ? value.error : undefined;
  if (typeof error !== "object" || error === null) {
    return "provider error";
  }
  const status = "status" in error && typeof error.status === "string" ? error.status : undefined;
  return status && /^[A-Z_]+$/.test(status) ? status : "provider error";
}

export class ChromeWebStoreClient {
  private readonly config: ChromeWebStoreConfig;
  private readonly fetchImplementation: FetchImplementation;
  private readonly tokenProvider: AccessTokenProvider;

  constructor(
    config: ChromeWebStoreConfig,
    options: { fetchImplementation?: FetchImplementation; tokenProvider?: AccessTokenProvider } = {},
  ) {
    this.config = {
      ...config,
      publisherId: requiredIdentifier(config.publisherId, "Publisher ID"),
      itemId: requiredIdentifier(config.itemId, "Item ID"),
    };
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.tokenProvider =
      options.tokenProvider ?? (() => getChromeWebStoreAccessToken(this.config));
  }

  private resourceName(): string {
    return `publishers/${this.config.publisherId}/items/${this.config.itemId}`;
  }

  private async request<T>(
    method: "GET" | "POST",
    url: string,
    body?: BodyInit,
    contentType?: string,
  ): Promise<T> {
    const token = await this.tokenProvider();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    const response = await this.fetchImplementation(url, { body, headers, method });
    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      throw new ChromeWebStoreApiError(response.status, safeApiReason(payload));
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return {} as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  fetchStatus(): Promise<ChromeWebStoreStatus> {
    return this.request("GET", `${API_ROOT}/v2/${this.resourceName()}:fetchStatus`);
  }

  upload(bytes: Uint8Array): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `${API_ROOT}/upload/v2/${this.resourceName()}:upload`,
      new Blob([Uint8Array.from(bytes).buffer], { type: "application/zip" }),
      "application/zip",
    );
  }

  publish(options: PublishOptions = {}): Promise<Record<string, unknown>> {
    const body = JSON.stringify({
      blockOnWarnings: !options.allowWarnings,
      publishType: options.staged ? "STAGED_PUBLISH" : "DEFAULT_PUBLISH",
      skipReview: Boolean(options.skipReview),
    });
    return this.request(
      "POST",
      `${API_ROOT}/v2/${this.resourceName()}:publish`,
      body,
      "application/json",
    );
  }

  cancelSubmission(): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `${API_ROOT}/v2/${this.resourceName()}:cancelSubmission`,
      "",
    );
  }

  setPublishedDeployPercentage(percentage: number): Promise<Record<string, unknown>> {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      throw new Error("Deploy percentage must be an integer between 0 and 100");
    }
    return this.request(
      "POST",
      `${API_ROOT}/v2/${this.resourceName()}:setPublishedDeployPercentage`,
      JSON.stringify({ deployPercentage: percentage }),
      "application/json",
    );
  }
}

export function revisionVersion(revision?: ItemRevisionStatus): string | undefined {
  return revision?.distributionChannels?.[0]?.crxVersion;
}

export function normalizeChromeState(status: ChromeWebStoreStatus): NormalizedReleaseState {
  if (status.takenDown || status.warned) {
    return "halted";
  }
  const state = status.submittedItemRevisionStatus?.state ?? status.publishedItemRevisionStatus?.state;
  switch (state) {
    case "PENDING_REVIEW":
      return "in-review";
    case "STAGED":
      return "approved";
    case "PUBLISHED":
    case "PUBLISHED_TO_TESTERS":
      return "published";
    case "REJECTED":
      return "rejected";
    case "CANCELLED":
      return "draft";
    default:
      return status.lastAsyncUploadState === "SUCCEEDED" ? "uploaded" : "unknown";
  }
}

export function assertNoConflictingSubmission(status: ChromeWebStoreStatus): void {
  const state = status.submittedItemRevisionStatus?.state;
  if (state === "PENDING_REVIEW" || state === "STAGED") {
    throw new Error(`Conflicting Chrome Web Store submission is ${state}`);
  }
}
