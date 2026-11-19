import type { HttpClient } from "../client.js";
import type { PublicPost, PublicPostList, PublicTagList } from "../types.js";

export interface ListPublicPostsParams {
  cursor?: string;
  limit?: number;
  tag?: string;
  q?: string;
}

export class PublicResource {
  constructor(private readonly http: HttpClient) {}

  info(slug: string): Promise<import("../launch-types.js").PublicBlog> {
    return this.http.get("/public/" + encodeURIComponent(slug));
  }
  sitemap(slug: string): Promise<string> {
    return this.http.text(
      "/public/" + encodeURIComponent(slug) + "/sitemap.xml",
    );
  }

  /** List published posts for a project (no auth required). */
  listPosts(
    projectSlug: string,
    params?: ListPublicPostsParams,
  ): Promise<PublicPostList> {
    return this.http.get<PublicPostList>(
      `/public/${projectSlug}/posts`,
      params,
    );
  }

  /** Get a single published post by slug (no auth required). */
  getPost(projectSlug: string, postSlug: string): Promise<PublicPost> {
    return this.http.get<PublicPost>(
      `/public/${projectSlug}/posts/${postSlug}`,
    );
  }

  /** List all tags for a published project (no auth required). */
  listTags(projectSlug: string): Promise<PublicTagList> {
    return this.http.get<PublicTagList>(`/public/${projectSlug}/tags`);
  }

  /**
   * Get the RSS 2.0 feed XML for a project.
   * Returns the raw XML string — parse with a feed reader.
   */
  async feed(projectSlug: string): Promise<string> {
    return this.http.text(
      `/public/${encodeURIComponent(projectSlug)}/feed.xml`,
    );
  }
}
