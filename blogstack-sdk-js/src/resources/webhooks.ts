import type { HttpClient } from "../client.js";
import type {
  Webhook,
  WebhookList,
  CreateWebhookRequest,
  UpdateWebhookRequest,
} from "../types.js";

/** @deprecated Customer webhooks are unavailable in this release; the API returns 409. */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** List all webhooks for a project. */
  list(projectId: string): Promise<WebhookList> {
    return this.http.get<WebhookList>(`/projects/${projectId}/webhooks`);
  }

  /** Create a new webhook endpoint. */
  create(
    projectId: string,
    data: CreateWebhookRequest,
  ): Promise<Webhook & { secret: string }> {
    return this.http.post<Webhook & { secret: string }>(
      `/projects/${projectId}/webhooks`,
      data,
    );
  }

  /** Update a webhook. */
  update(
    projectId: string,
    webhookId: string,
    data: UpdateWebhookRequest,
  ): Promise<Webhook> {
    return this.http.patch<Webhook>(
      `/projects/${projectId}/webhooks/${webhookId}`,
      data,
    );
  }

  /** Delete a webhook. */
  delete(projectId: string, webhookId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/webhooks/${webhookId}`);
  }
}
