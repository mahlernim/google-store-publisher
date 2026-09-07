export const providers = ["chrome-web-store", "google-play"] as const;

export type Provider = (typeof providers)[number];

export const operations = [
  "inspect",
  "upload",
  "validate",
  "submit",
  "status",
  "rollout",
  "cancel",
] as const;

export type Operation = (typeof operations)[number];

export type NormalizedReleaseState =
  | "draft"
  | "uploaded"
  | "ready-for-review"
  | "in-review"
  | "approved"
  | "published"
  | "rejected"
  | "halted"
  | "unknown";

export interface ReleaseTarget {
  provider: Provider;
  resource: string;
  channel?: string;
}

export interface ExpectedRelease {
  target: ReleaseTarget;
  version?: string;
  artifactPath?: string;
}

export interface ReleaseResult {
  operation: Operation;
  target: ReleaseTarget;
  version?: string;
  normalizedState: NormalizedReleaseState;
  nativeState: string;
  changed: boolean;
  operationId?: string;
  observedAt: string;
}

export interface StorePublisher {
  readonly provider: Provider;
  inspect(expected: ExpectedRelease): Promise<ReleaseResult>;
  status(expected: ExpectedRelease): Promise<ReleaseResult>;
}
