import { GoogleAuth } from "google-auth-library";

export class PlayError extends Error {
  constructor(public readonly code: string, message: string, public readonly uncertain = false) {
    super(message);
  }
}

export interface Request {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  media?: Uint8Array;
}
export interface Transport { request<T>(request: Request): Promise<T> }

/** Fixed Google endpoint, ADC, no redirects and no automatic mutation retries. */
export class GoogleTransport implements Transport {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly token?: () => Promise<string>) {}

  async request<T>(request: Request): Promise<T> {
    if (!/^applications\/[A-Za-z0-9_.%/-]+(?:[:?][A-Za-z0-9_=&:%.-]+)?$/.test(request.path)) {
      throw new PlayError("INVALID_PATH", "Invalid Google Play resource path.");
    }
    let token: string;
    try {
      token = this.token ? await this.token() : (await this.auth.getAccessToken()) ?? "";
      if (!token) throw new Error();
    } catch { throw new PlayError("AUTHENTICATION", "Application Default Credentials could not obtain a Play access token."); }
    const prefix = request.media ? "upload/androidpublisher/v3/" : "androidpublisher/v3/";
    let response: Response;
    try {
      response = await this.fetcher(`https://androidpublisher.googleapis.com/${prefix}${request.path}`, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(request.media ? { "Content-Type": "application/octet-stream" } : request.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: request.media ? new Uint8Array(request.media) : request.body !== undefined ? JSON.stringify(request.body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(request.media ? 120_000 : 30_000),
      });
    } catch {
      throw new PlayError("TRANSPORT", "Google request did not complete. Reconcile saved edit and release status before retrying.", request.method !== "GET");
    }
    if (!response.ok) {
      // Do not surface provider bodies, credentials, request headers or local paths.
      throw new PlayError(`HTTP_${response.status}`, `Google Play returned HTTP ${response.status}. Inspect the saved edit or Console for details.`, request.method !== "GET" && response.status >= 500);
    }
    try { return (response.status === 204 ? {} : await response.json()) as T; }
    catch { throw new PlayError("INVALID_RESPONSE", "Google returned an unreadable response. Reconcile before retrying.", request.method !== "GET"); }
  }
}
