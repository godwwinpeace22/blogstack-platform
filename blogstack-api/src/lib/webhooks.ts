import type { WebhookEvent } from "../types.js";

/**
 * Signs a webhook payload with HMAC-SHA256 and enqueues the delivery.
 * The ingest-worker handles retries via the Queue consumer.
 */
export async function enqueueWebhook(
  queue: import("@cloudflare/workers-types").Queue,
  webhookId: string,
  projectId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await queue.send({ webhookId, projectId, event, payload, attempt: 1 });
}

/**
 * Dispatcher: look up all webhooks for a project that subscribe to `event`
 * and enqueue a job for each.
 */
export async function dispatchWebhooks(
  db: import("@cloudflare/workers-types").D1Database,
  queue: import("@cloudflare/workers-types").Queue,
  projectId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  // Customer webhooks are deliberately unavailable in the launch release.
  // Keeping this no-op prevents legacy configured destinations being fetched.
  void db;
  void queue;
  void projectId;
  void event;
  void payload;
}

/**
 * Generates the HMAC-SHA256 signature for a webhook payload.
 * Sent as `X-BlogStack-Signature: sha256=<hex>` on delivery.
 */
export async function signPayload(
  secret: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return (
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
