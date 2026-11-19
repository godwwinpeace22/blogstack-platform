import type { HttpClient } from "../client.js";
import type {
  Post,
  PostList,
  CreatePostRequest,
  UpdatePostRequest,
  SchedulePostRequest,
} from "../types.js";

export interface ListPostsParams {
  cursor?: string;
  limit?: number;
  status?: "draft" | "published" | "scheduled";
  tag?: string;
  q?: string;
}

export class PostsResource {
  constructor(private readonly http: HttpClient) {}

  /** List posts for a project. */
  list(projectId: string, params?: ListPostsParams): Promise<PostList> {
    return this.http.get<PostList>(`/projects/${projectId}/posts`, params);
  }

  /** Create a new post. */
  create(projectId: string, data: CreatePostRequest): Promise<Post> {
    return this.http.post<Post>(`/projects/${projectId}/posts`, data);
  }

  /** Get a post by ID. */
  get(projectId: string, postId: string): Promise<Post> {
    return this.http.get<Post>(`/projects/${projectId}/posts/${postId}`);
  }

  /** Update a post. */
  update(
    projectId: string,
    postId: string,
    data: UpdatePostRequest,
  ): Promise<Post> {
    return this.http.patch<Post>(
      `/projects/${projectId}/posts/${postId}`,
      data,
    );
  }

  /** Delete a post. */
  delete(projectId: string, postId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/posts/${postId}`);
  }

  /** Publish a draft post immediately. */
  publish(projectId: string, postId: string, revision?: number): Promise<Post> {
    return this.http.post<Post>(
      `/projects/${projectId}/posts/${postId}/publish`,
      revision === undefined ? undefined : { revision },
    );
  }

  /** Unpublish / revert to draft. */
  unpublish(
    projectId: string,
    postId: string,
    revision?: number,
  ): Promise<Post> {
    return this.http.post<Post>(
      `/projects/${projectId}/posts/${postId}/unpublish`,
    );
  }

  preview(
    projectId: string,
    postId: string,
  ): Promise<{ revision: number; renderedHtml: string }> {
    return this.http.get(
      "/projects/" + projectId + "/posts/" + postId + "/preview",
    );
  }
  /** @deprecated Scheduled publishing is unavailable in the paid launch; the API returns 409. */
  schedule(
    projectId: string,
    postId: string,
    data: SchedulePostRequest,
  ): Promise<Post> {
    return this.http.post<Post>(
      `/projects/${projectId}/posts/${postId}/schedule`,
      data,
    );
  }

  /** Duplicate a post (creates a new draft copy). */
  duplicate(projectId: string, postId: string): Promise<Post> {
    return this.http.post<Post>(
      `/projects/${projectId}/posts/${postId}/duplicate`,
    );
  }
}
