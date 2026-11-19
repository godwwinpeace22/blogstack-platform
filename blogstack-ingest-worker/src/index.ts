interface Env {
  MAIN_DB: D1Database;
  WEBHOOK_SIGNING_KEY: string;
}

// ─── Webhook queue message ────────────────────────────────────────────────────

interface WebhookMessage {
  webhookId: string;
  projectId: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

// ─── Image processing queue message ──────────────────────────────────────────

interface ImageProcessingMessage {
  mediaId: string;
  projectId: string;
  r2Key: string;
  originalFilename: string;
}

// ─── Webhook delivery ────────────────────────────────────────────────────────

async function deliverWebhook(
  db: D1Database,
  msg: WebhookMessage,
): Promise<void> {
  // Fetch webhook config from D1
  const webhook = await db
    .prepare(
      "SELECT url, secret FROM webhooks WHERE id = ? AND enabled = 1",
    )
    .bind(msg.webhookId)
    .first<{ url: string; secret: string }>();

  if (!webhook) {
    // Webhook deleted or deactivated — discard
    return;
  }

  const body = JSON.stringify({
    event: msg.event,
    projectId: msg.projectId,
    data: msg.payload,
    deliveredAt: new Date().toISOString(),
  });

  // Sign the payload
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhook.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const sig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Deliver to endpoint
  const res = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BlogStack-Signature": `sha256=${sig}`,
      "X-BlogStack-Event": msg.event,
      "User-Agent": "BlogStack/1.0 (webhook)",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  // Record delivery attempt
  const success = res.ok;
  const status = success ? "delivered" : "failed";

  await db
    .prepare(
      `INSERT INTO webhook_deliveries
         (webhook_id, event, status, response_status, attempt_number, delivered_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())`,
    )
    .bind(msg.webhookId, msg.event, status, res.status, msg.attempt)
    .run();

  if (!success) {
    throw new Error(
      `Webhook delivery to ${webhook.url} failed: HTTP ${res.status}`,
    );
  }
}

// ─── Image processing ─────────────────────────────────────────────────────────

async function processImage(
  db: D1Database,
  msg: ImageProcessingMessage,
): Promise<void> {
  // Mark as processed in D1
  await db
    .prepare(
      "UPDATE media SET status = 'processed', processed_at = unixepoch() WHERE id = ?",
    )
    .bind(msg.mediaId)
    .run();

  // Image transformation (resize/optimize) is handled by Cloudflare Images
  // or by CF R2 Transform Worker — this consumer just records completion.
  // If you need custom transforms, add them here via Workers Bindings.
}

// ─── Queue handler ────────────────────────────────────────────────────────────

type IngestMessage = WebhookMessage | ImageProcessingMessage;

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const { messages, queue } = batch;

    for (const message of messages) {
      try {
        if (queue === "blogstack-webhooks") {
          await deliverWebhook(env.MAIN_DB, message.body as WebhookMessage);
        } else if (queue === "blogstack-image-processing") {
          await processImage(
            env.MAIN_DB,
            message.body as ImageProcessingMessage,
          );
        }
        message.ack();
      } catch (err) {
        // Retry on failure (up to max_retries in wrangler.toml)
        message.retry();
        console.error(
          `[ingest] Failed to process message from ${queue}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  },
} satisfies ExportedHandler<Env>;
