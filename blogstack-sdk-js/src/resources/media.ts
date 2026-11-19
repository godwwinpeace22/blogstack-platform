import type { HttpClient } from "../client.js";
import type {
  Media,
  MediaList,
  PresignMediaRequest,
  PresignMediaResponse,
} from "../types.js";

export class MediaResource {
  constructor(private readonly http: HttpClient) {}

  /** List all confirmed media assets for a project. */
  list(
    projectId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<MediaList> {
    return this.http.get<MediaList>(`/projects/${projectId}/media`, params);
  }

  /**
   * Request a signed upload URL to upload media directly from the browser.
   * After uploading to the returned `presignedUrl`, call `confirm()`.
   */
  presign(
    projectId: string,
    data: PresignMediaRequest,
  ): Promise<PresignMediaResponse> {
    return this.http.post<PresignMediaResponse>(
      `/projects/${projectId}/media/presign`,
      data,
    );
  }

  /** Confirm that a media upload completed successfully. */
  confirm(projectId: string, mediaId: string): Promise<Media> {
    return this.http.post<Media>(
      `/projects/${projectId}/media/confirm/${mediaId}`,
      {},
    );
  }

  async upload(projectId: string, file: File): Promise<Media> {
    const signed = await this.presign(projectId, {
      filename: file.name,
      mimeType: file.type as PresignMediaRequest["mimeType"],
      size: file.size,
    });
    await this.http.upload(signed.presignedUrl, file);
    return this.confirm(projectId, signed.mediaId);
  }
  downloadUrl(projectId: string, mediaId: string) {
    return (
      this.http.baseUrl +
      "/projects/" +
      encodeURIComponent(projectId) +
      "/media/" +
      encodeURIComponent(mediaId) +
      "/download"
    );
  }
  /** Delete a media asset. */
  delete(projectId: string, mediaId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/media/${mediaId}`);
  }
}
