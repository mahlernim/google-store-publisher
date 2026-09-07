import {
  ChromeWebStoreApiError,
  ChromeWebStoreClient,
  assertNoConflictingSubmission,
  inspectChromeArtifact,
  normalizeChromeState,
  revisionVersion,
  type ChromeWebStoreStatus,
} from "@google-store-publisher/chrome-web-store";

export interface ChromeCliValues {
  "allow-warnings"?: boolean;
  "service-account"?: string;
  "skip-review"?: boolean;
  artifact?: string;
  execute?: boolean;
  item?: string;
  percentage?: string;
  project?: string;
  publisher?: string;
  staged?: boolean;
  version?: string;
  [key: string]: boolean | string | undefined;
}

export class ChromeCommandError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ChromeCommandError";
  }
}

const allowed: Record<string, string[]> = {
  cancel: ["publisher", "item", "service-account", "project", "version", "execute"],
  inspect: ["publisher", "item", "service-account", "project"],
  rollout: ["publisher", "item", "service-account", "project", "version", "percentage", "execute"],
  status: ["publisher", "item", "service-account", "project"],
  submit: ["publisher", "item", "service-account", "project", "artifact", "version",
    "staged", "skip-review", "allow-warnings", "execute"],
  upload: ["publisher", "item", "service-account", "project", "artifact", "version", "execute"],
  validate: ["artifact", "version"],
};

function required(value: string | undefined, key: string): string {
  if (!value?.trim()) {
    throw new ChromeCommandError("ARGUMENT", `Missing --${key}.`);
  }
  return value;
}

function assertVersion(expected: string, observed: string | undefined, context: string): void {
  if (observed !== expected) {
    throw new ChromeCommandError(
      "VERSION_MISMATCH",
      `${context} version mismatch. Expected ${expected}, observed ${observed ?? "none"}.`,
    );
  }
}

function summarizeStatus(status: ChromeWebStoreStatus) {
  return {
    itemId: status.itemId,
    lastAsyncUploadState: status.lastAsyncUploadState,
    normalizedState: normalizeChromeState(status),
    published: status.publishedItemRevisionStatus,
    submitted: status.submittedItemRevisionStatus,
    takenDown: Boolean(status.takenDown),
    warned: Boolean(status.warned),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForUpload(
  client: ChromeWebStoreClient,
  initialState: unknown,
): Promise<void> {
  let state = typeof initialState === "string" ? initialState : "UPLOAD_STATE_UNSPECIFIED";
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (state === "SUCCEEDED") {
      return;
    }
    if (state === "FAILED" || state === "NOT_FOUND") {
      throw new ChromeCommandError("UPLOAD_FAILED", `Chrome Web Store upload ended in ${state}.`);
    }
    await delay(2_000);
    const status = await client.fetchStatus();
    state = status.lastAsyncUploadState ?? state;
  }
  throw new ChromeCommandError(
    "UPLOAD_TIMEOUT",
    `Chrome Web Store upload did not finish within 30 seconds (${state}).`,
  );
}

async function waitForSubmittedVersion(
  client: ChromeWebStoreClient,
  expectedVersion: string,
): Promise<ChromeWebStoreStatus> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const status = await client.fetchStatus();
    if (revisionVersion(status.submittedItemRevisionStatus) === expectedVersion) {
      return status;
    }
    if (attempt < 14) {
      await delay(2_000);
    }
  }
  throw new ChromeCommandError(
    "RECONCILIATION_TIMEOUT",
    `Submitted version ${expectedVersion} was not observable within 30 seconds.`,
  );
}

export async function runChrome(
  command: string | undefined,
  values: ChromeCliValues,
  output: (value: unknown) => void,
): Promise<void> {
  if (!command || !(command in allowed)) {
    throw new ChromeCommandError("ARGUMENT", "Unknown Chrome command. Run --help.");
  }
  if (Object.keys(values).some((key) => !allowed[command]!.includes(key))) {
    throw new ChromeCommandError("ARGUMENT", "An option is not supported by this Chrome command.");
  }

  if (command === "validate") {
    const expectedVersion = required(values.version, "version");
    const artifact = await inspectChromeArtifact(required(values.artifact, "artifact"));
    assertVersion(expectedVersion, artifact.version, "Artifact");
    output({ artifact: artifact.path, offline: true, operation: command, provider: "chrome-web-store",
      sha256: artifact.sha256, sizeBytes: artifact.sizeBytes, version: artifact.version });
    return;
  }

  const publisherId = required(values.publisher ?? process.env.CWS_PUBLISHER_ID, "publisher");
  const itemId = required(values.item ?? process.env.CWS_ITEM_ID, "item");
  const client = new ChromeWebStoreClient({
    itemId,
    projectId: values.project ?? process.env.CWS_PROJECT_ID,
    publisherId,
    serviceAccount: values["service-account"] ?? process.env.CWS_SERVICE_ACCOUNT,
  });
  const target = { itemId, provider: "chrome-web-store", publisherId };

  if (command === "status" || command === "inspect") {
    output({ operation: command, target, status: summarizeStatus(await client.fetchStatus()) });
    return;
  }

  const expectedVersion = required(values.version, "version");
  const plan: Record<string, unknown> = {
    changed: false,
    executionMode: values.execute ? "execute" : "dry-run",
    expectedVersion,
    operation: command,
    target,
  };
  let artifact: Awaited<ReturnType<typeof inspectChromeArtifact>> | undefined;
  if (command === "upload" || command === "submit") {
    artifact = await inspectChromeArtifact(required(values.artifact, "artifact"));
    assertVersion(expectedVersion, artifact.version, "Artifact");
    plan.artifact = { path: artifact.path, sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes, version: artifact.version };
  }
  if (command === "submit") {
    plan.publish = { blockOnWarnings: !values["allow-warnings"],
      publishType: values.staged ? "STAGED_PUBLISH" : "DEFAULT_PUBLISH",
      skipReview: Boolean(values["skip-review"]) };
  }
  const percentage = values.percentage === undefined ? undefined : Number(values.percentage);
  if (command === "rollout") {
    if (!Number.isInteger(percentage) || percentage === undefined || percentage < 0 || percentage > 100) {
      throw new ChromeCommandError("ARGUMENT", "--percentage must be an integer between 0 and 100.");
    }
    plan.percentage = percentage;
  }
  if (!values.execute) {
    output(plan);
    return;
  }

  const before = await client.fetchStatus();
  if (before.takenDown || before.warned) {
    throw new ChromeCommandError(
      "POLICY_HOLD",
      "Chrome Web Store item is warned or taken down. Use the dashboard for details.",
    );
  }
  if (command === "upload" || command === "submit") {
    try {
      assertNoConflictingSubmission(before);
    } catch {
      throw new ChromeCommandError("SUBMISSION_CONFLICT", "An active Chrome submission blocks this operation.");
    }
  }

  let providerResponse: Record<string, unknown> = {};
  if (command === "upload") {
    providerResponse = await client.upload(artifact!.bytes);
  } else if (command === "submit") {
    const uploadResponse = await client.upload(artifact!.bytes);
    await waitForUpload(client, uploadResponse.uploadState);
    providerResponse = await client.publish({
      allowWarnings: values["allow-warnings"],
      skipReview: values["skip-review"],
      staged: values.staged,
    });
    plan.uploadResponse = uploadResponse;
  } else if (command === "cancel") {
    assertVersion(expectedVersion, revisionVersion(before.submittedItemRevisionStatus), "Submitted");
    providerResponse = await client.cancelSubmission();
  } else {
    assertVersion(expectedVersion, revisionVersion(before.publishedItemRevisionStatus), "Published");
    providerResponse = await client.setPublishedDeployPercentage(percentage!);
  }

  const after = command === "submit"
    ? await waitForSubmittedVersion(client, expectedVersion)
    : await client.fetchStatus();
  output({ ...plan, changed: true, providerResponse, status: summarizeStatus(after) });
}

export function chromeErrorResult(error: unknown) {
  if (error instanceof ChromeCommandError) {
    return { code: error.code, message: error.message, uncertain: false };
  }
  if (error instanceof ChromeWebStoreApiError) {
    return { code: `HTTP_${error.status}`, message: error.message, uncertain: error.status >= 500 };
  }
  return undefined;
}
