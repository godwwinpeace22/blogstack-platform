import type { BlogPost, BlogTag } from "./blog-types.js";

export interface BlogPage {
  data: BlogPost[];
  nextCursor: string | null;
  total?: number;
}

export interface BlogListOptions {
  limit?: number;
  cursor?: string | null;
  tag?: string | null;
  query?: string;
  signal?: AbortSignal;
}

export interface BlogRequestOptions {
  signal?: AbortSignal;
}

export interface BlogDataSource {
  listPosts(options?: BlogListOptions): Promise<BlogPage>;
  getPost(slug: string, options?: BlogRequestOptions): Promise<BlogPost>;
  listTags(options?: BlogRequestOptions): Promise<BlogTag[]>;
}

export interface CreateBlogClientOptions {
  projectSlug: string;
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
}

async function readJson(
  response: Response,
  fallback: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new Error(
      response.status === 404 ? "This blog could not be found." : fallback,
    );
  }
  return response.json();
}

function requestInit(signal?: AbortSignal): RequestInit | undefined {
  return signal ? { signal } : undefined;
}

/**
 * Framework-neutral public content client. Use it during SSR, static builds,
 * edge rendering, server routes, or in the browser.
 */
export function createBlogClient({
  projectSlug,
  apiUrl = "https://blogstack-app.hidden-silence-2d18.workers.dev",
  fetch: request = globalThis.fetch,
}: CreateBlogClientOptions): BlogDataSource {
  if (!projectSlug.trim()) throw new Error("projectSlug is required.");
  if (!request) throw new Error("A Fetch API implementation is required.");
  const base = `${apiUrl.replace(/\/$/, "")}/public/${encodeURIComponent(projectSlug)}`;

  return {
    async listPosts(options = {}) {
      const limit = Number.isFinite(options.limit)
        ? Math.max(1, Math.min(100, Math.floor(options.limit ?? 9)))
        : 9;
      const params = new URLSearchParams({ limit: String(limit) });
      if (options.query) params.set("q", options.query);
      if (options.tag) params.set("tag", options.tag);
      if (options.cursor) params.set("cursor", options.cursor);
      const result = await readJson(
        await request(`${base}/posts?${params}`, requestInit(options.signal)),
        "Posts could not be loaded.",
      );
      if (
        !result ||
        typeof result !== "object" ||
        !Array.isArray((result as BlogPage).data)
      ) {
        throw new Error("The blog returned an invalid response.");
      }
      const page = result as BlogPage;
      return { ...page, nextCursor: page.nextCursor ?? null };
    },

    async getPost(slug, options = {}) {
      const response = await request(
        `${base}/posts/${encodeURIComponent(slug)}`,
        requestInit(options.signal),
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This story is no longer available."
            : "This story could not be loaded.",
        );
      }
      const result = (await response.json()) as BlogPost;
      if (
        !result ||
        typeof result !== "object" ||
        typeof result.slug !== "string"
      ) {
        throw new Error("The blog returned an invalid response.");
      }
      return result;
    },

    async listTags(options = {}) {
      const result = await readJson(
        await request(`${base}/tags`, requestInit(options.signal)),
        "Tags could not be loaded.",
      );
      if (!Array.isArray(result))
        throw new Error("The blog returned an invalid response.");
      return result as BlogTag[];
    },
  };
}
