import type { HttpClient } from "../client.js";
import type {
  Tag,
  TagList,
  CreateTagRequest,
  UpdateTagRequest,
  MergeTagsRequest,
} from "../types.js";

export class TagsResource {
  constructor(private readonly http: HttpClient) {}

  /** List all tags for a project. */
  list(projectId: string): Promise<TagList> {
    return this.http.get<TagList>(`/projects/${projectId}/tags`);
  }

  /** Create a new tag. */
  create(projectId: string, data: CreateTagRequest): Promise<Tag> {
    return this.http.post<Tag>(`/projects/${projectId}/tags`, data);
  }

  /** Update a tag. */
  update(
    projectId: string,
    tagId: string,
    data: UpdateTagRequest,
  ): Promise<Tag> {
    return this.http.patch<Tag>(`/projects/${projectId}/tags/${tagId}`, data);
  }

  /** Delete a tag (posts retain their content; only the tag association is removed). */
  delete(projectId: string, tagId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/tags/${tagId}`);
  }

  /**
   * Merge `sourceId` into `targetId`.
   * All posts tagged with `sourceId` will be re-tagged with `targetId`,
   * and the source tag is deleted.
   */
  merge(projectId: string, data: MergeTagsRequest): Promise<Tag> {
    return this.http.post<Tag>(`/projects/${projectId}/tags/merge`, data);
  }
}
