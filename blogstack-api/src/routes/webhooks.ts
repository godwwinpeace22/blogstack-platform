import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import type { HonoEnv, DbWebhook, WebhookEvent } from "../types.js";

const VALID_EVENTS: WebhookEvent[] = [
  "post.published",
  "post.scheduled",
  "post.deleted",
  "post.updated",
  "media.uploaded",
  "member.invited",
  "member.joined",
];

const WebhookEventEnum = z.enum([
  "post.published",
  "post.scheduled",
  "post.deleted",
  "post.updated",
  "media.uploaded",
  "member.invited",
  "member.joined",
]);

const app = new Hono<HonoEnv>();

function serializeWebhook(w: DbWebhook) {
  return {
    id: w.id,
    projectId: w.project_id,
    url: w.url,
    events: JSON.parse(w.events) as WebhookEvent[],
    enabled: w.enabled === 1,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// GET /projects/:projectId/webhooks
app.get("/:projectId/webhooks", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "project_admin");

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at DESC`,
  )
    .bind(projectId)
    .all<DbWebhook>();

  return c.json(rows.results.map(serializeWebhook));
});

// POST /projects/:projectId/webhooks
app.post(
  "/:projectId/webhooks",
  requireAuth,
  zValidator(
    "json",
    z.object({
      url: z.url(),
      events: z.array(WebhookEventEnum).min(1),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId } = c.req.param();

    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(role, "project_admin");

    const { url, events } = c.req.valid("json");

    // Generate a random signing secret
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await c.env.MAIN_DB.prepare(
      `INSERT INTO webhooks (id, project_id, url, events, secret, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(id, projectId, url, JSON.stringify(events), secret, now, now)
      .run();

    const webhook = await c.env.MAIN_DB.prepare(
      `SELECT * FROM webhooks WHERE id = ?`,
    )
      .bind(id)
      .first<DbWebhook>();

    return c.json({ ...serializeWebhook(webhook!), secret }, 201);
  },
);

// PATCH /projects/:projectId/webhooks/:webhookId
app.patch(
  "/:projectId/webhooks/:webhookId",
  requireAuth,
  zValidator(
    "json",
    z.object({
      url: z.url().optional(),
      events: z.array(WebhookEventEnum).min(1).optional(),
      enabled: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId, webhookId } = c.req.param();

    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(role, "project_admin");

    const { url, events, enabled } = c.req.valid("json");
    const updates: string[] = [];
    const bindings: unknown[] = [];
    const now = Math.floor(Date.now() / 1000);

    if (url !== undefined) {
      updates.push("url = ?");
      bindings.push(url);
    }
    if (events !== undefined) {
      updates.push("events = ?");
      bindings.push(JSON.stringify(events));
    }
    if (enabled !== undefined) {
      updates.push("enabled = ?");
      bindings.push(enabled ? 1 : 0);
    }

    if (updates.length > 0) {
      bindings.push(now, webhookId, projectId);
      await c.env.MAIN_DB.prepare(
        `UPDATE webhooks SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND project_id = ?`,
      )
        .bind(...bindings)
        .run();
    }

    const webhook = await c.env.MAIN_DB.prepare(
      `SELECT * FROM webhooks WHERE id = ? AND project_id = ?`,
    )
      .bind(webhookId, projectId)
      .first<DbWebhook>();

    if (!webhook)
      return c.json({ error: "Webhook not found", code: "NOT_FOUND" }, 404);

    return c.json(serializeWebhook(webhook));
  },
);

// DELETE /projects/:projectId/webhooks/:webhookId
app.delete("/:projectId/webhooks/:webhookId", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId, webhookId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "project_admin");

  const result = await c.env.MAIN_DB.prepare(
    `DELETE FROM webhooks WHERE id = ? AND project_id = ?`,
  )
    .bind(webhookId, projectId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Webhook not found", code: "NOT_FOUND" }, 404);
  }

  return c.body(null, 204);
});

export { VALID_EVENTS };
export default app;
