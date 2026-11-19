import { BlogStackApiError } from "./types.js";
import type { BlogStackError } from "./types.js";

export interface BlogStackClientOptions {
  accountId?: string;
  sessionKey?: string;
  /** Base URL of the BlogStack API. Defaults to https://blogstack-app.hidden-silence-2d18.workers.dev */
  baseUrl?: string;
  /** API key (bsk_live_…) for server-side usage. */
  apiKey?: string;
  /** Custom fetch implementation. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export class HttpClient {
  readonly baseUrl: string;
  accountId: string | undefined;
  sessionKey: string;
  private readonly apiKey: string | undefined;
  private readonly _fetch: typeof fetch;

  constructor(options: BlogStackClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://blogstack-app.hidden-silence-2d18.workers.dev").replace(
      /\/$/,
      "",
    );
    this.apiKey = options.apiKey;
    this.accountId = options.accountId;
    this.sessionKey = options.sessionKey ?? crypto.randomUUID();
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    if (this.accountId) headers["x-blogstack-account-id"] = this.accountId;
    return { ...headers, ...extra };
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    searchParams?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (searchParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers = this.buildHeaders();
    if (path.startsWith("/public/")) {
      delete headers["x-api-key"];
      delete headers["x-blogstack-account-id"];
    }
    const res = await this._fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : null,
      credentials: path.startsWith("/public/") ? "omit" : "include", // Send cookies for session-based auth
    });

    if (!res.ok) {
      let errBody: BlogStackError;
      try {
        errBody = (await res.json()) as BlogStackError;
      } catch {
        errBody = { error: res.statusText, code: "UNKNOWN" };
      }
      throw new BlogStackApiError(res.status, errBody);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  async text(path: string): Promise<string> {
    const response = await this._fetch(`${this.baseUrl}${path}`, {
      headers: { accept: "application/rss+xml" },
    });
    if (!response.ok)
      throw new BlogStackApiError(response.status, {
        error: response.statusText || "Request failed",
        code: "REQUEST_FAILED",
      });
    return response.text();
  }

  async upload(url: string, file: Blob): Promise<void> {
    const response = await this._fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
      credentials: "omit",
    });
    if (!response.ok) throw new Error("Image upload failed. Please try again.");
  }

  get<T>(path: string, searchParams?: object): Promise<T> {
    return this.request<T>(
      "GET",
      path,
      undefined,
      searchParams as Record<string, string | number | boolean | undefined>,
    );
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
