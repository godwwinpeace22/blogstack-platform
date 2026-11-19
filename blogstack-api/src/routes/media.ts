import { pagination, encodeCursor } from "../lib/pagination.js";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import { deleteMedia } from "../lib/r2.js";
import type { HonoEnv, DbMedia } from "../types.js";

const app = new Hono<HonoEnv>();

// ─── GET /projects/:projectId/media ───────────────────────────────────────────

app.get("/:projectId/media", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "writer");

  const { cursor, limit } = pagination(c.req.query(), 50, 200);

  const conditions: string[] = ["project_id = ?", "confirmed = 1"];
  const bindings: unknown[] = [projectId];

  const countConditions = [...conditions];
  const countBindings = [...bindings];
  if (cursor) {
    conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
    bindings.push(cursor.time, cursor.time, cursor.id);
  }

  bindings.push(limit + 1);

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT * FROM media WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(...bindings)
    .all<DbMedia>();

  const total = await c.env.MAIN_DB.prepare(
    `SELECT COUNT(*) AS cnt FROM media WHERE project_id = ? AND confirmed = 1`,
  )
    .bind(projectId)
    .first<{ cnt: number }>();

  const hasMore = rows.results.length > limit;
  const items = rows.results.slice(0, limit);

  return c.json({
    data: items.map(serializeMedia),
    total: total?.cnt ?? 0,
    nextCursor: hasMore
      ? encodeCursor(
          items[items.length - 1]!.created_at,
          items[items.length - 1]!.id,
        )
      : null,
  });
});

// ─── POST /projects/:projectId/media/presign ──────────────────────────────────

app.post(
  "/:projectId/media/presign",
  requireAuth,
  zValidator(
    "json",
    z.object({
      filename: z.string().min(1).max(255),
      size: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024)
        .optional(),
      mimeType: z.enum([
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/avif",
      ]),
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
    assertProjectRole(role, "writer");

    const { filename, mimeType, size: expectedSize } = c.req.valid("json");

    const mediaId = crypto.randomUUID();
    const ext = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/avif": "avif",
    }[mimeType];
    const key = `${projectId}/${mediaId}.${ext}`;
    const now = Math.floor(Date.now() / 1000);

    // Insert unconfirmed record — confirmed after browser completes PUT
    await c.env.MAIN_DB.prepare(
      `INSERT INTO media (id, project_id, key, url, filename, mime_type, uploaded_by, confirmed, created_at, reserved_size, reservation_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
      .bind(
        mediaId,
        projectId,
        key,
        `${c.env.CDN_URL}/${encodeURIComponent(key)}`,
        filename,
        mimeType,
        userId,
        now,
        expectedSize ?? 10 * 1024 * 1024,
        now + 900,
      )
      .run();

    // Generate presigned URL via HMAC-signed CDN URL scheme
    // (avoids needing S3 credentials in the worker; CDN worker validates the sig)
    const expiresAt = now + 900; // 15 minutes
    const sigData = `PUT:${key}:${mimeType}:${expiresAt}`;
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(c.env.CDN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      new TextEncoder().encode(sigData),
    );
    const sigHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const presignedUrl =
      `${c.env.CDN_URL}/upload/${encodeURIComponent(key)}` +
      `?expires=${expiresAt}&type=${encodeURIComponent(mimeType)}&sig=${sigHex}`;

    return c.json({
      presignedUrl,
      mediaId,
      key,
      expiresAt,
      maxSize: 10 * 1024 * 1024,
    });
  },
);

// ─── POST /projects/:projectId/media/confirm/:mediaId ────────────────────────

app.post(
  "/:projectId/media/confirm/:mediaId",
  requireAuth,
  zValidator(
    "json",
    z.object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      size: z.number().int().positive().optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId, mediaId } = c.req.param();

    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(role, "writer");

    const media = await c.env.MAIN_DB.prepare(
      `SELECT * FROM media WHERE id = ? AND project_id = ? AND uploaded_by = ?`,
    )
      .bind(mediaId, projectId, userId)
      .first<DbMedia>();
    if (!media)
      return c.json({ error: "Media not found", code: "NOT_FOUND" }, 404);
    if (
      !media.confirmed &&
      (media.reservation_expires_at ?? 0) <= Math.floor(Date.now() / 1000)
    )
      return c.json(
        { error: "Upload reservation expired", code: "UPLOAD_EXPIRED" },
        409,
      );
    if (media.confirmed) return c.json(serializeMedia(media));
    const object = await c.env.MEDIA.head(media.key);
    if (!object)
      return c.json(
        { error: "Upload has not completed", code: "UPLOAD_MISSING" },
        409,
      );
    if (
      object.size <= 0 ||
      object.size > media.reserved_size ||
      object.httpMetadata?.contentType !== media.mime_type
    )
      return c.json(
        { error: "Invalid uploaded object", code: "INVALID_UPLOAD" },
        400,
      );
    const updated = await c.env.MAIN_DB.prepare(
      `UPDATE media SET confirmed = 1, size = ? WHERE id = ? AND confirmed = 0`,
    )
      .bind(object.size, mediaId)
      .run();
    media.confirmed = 1;
    media.size = object.size;

    return c.json(serializeMedia(media!));
  },
);

// ─── DELETE /projects/:projectId/media/:mediaId ───────────────────────────────

app.delete("/:projectId/media/:mediaId", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId, mediaId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "editor");

  const media = await c.env.MAIN_DB.prepare(
    `SELECT * FROM media WHERE id = ? AND project_id = ?`,
  )
    .bind(mediaId, projectId)
    .first<DbMedia>();

  if (!media)
    return c.json({ error: "Media not found", code: "NOT_FOUND" }, 404);

  // 1. Delete from R2 + purge CDN KV cache
  await deleteMedia(c.env, media.key, mediaId);

  // 2. Delete D1 record
  await c.env.MAIN_DB.prepare(`DELETE FROM media WHERE id = ?`)
    .bind(mediaId)
    .run();

  return c.body(null, 204);
});

app.get("/:projectId/media/:mediaId/download", requireAuth, async (c) => {
  if (c.var.apiKey)
    return c.json(
      { error: "Media export requires a user session", code: "FORBIDDEN" },
      403,
    );
  const { projectId, mediaId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "project_admin",
  );
  const media = await c.env.MAIN_DB.prepare(
    "SELECT * FROM media WHERE id=? AND project_id=? AND confirmed=1",
  )
    .bind(mediaId, projectId)
    .first<DbMedia>();
  if (!media)
    return c.json({ error: "Media not found", code: "NOT_FOUND" }, 404);
  const object = await c.env.MEDIA.get(media.key);
  if (!object)
    return c.json({ error: "Media not found", code: "NOT_FOUND" }, 404);
  return new Response(object.body as unknown as BodyInit, {
    headers: {
      "Content-Type": media.mime_type || "application/octet-stream",
      "Content-Disposition":
        'attachment; filename="' +
        media.filename.replace(/[^a-zA-Z0-9._-]/g, "_") +
        '"',
      "Cache-Control": "no-store",
    },
  });
});

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeMedia(m: DbMedia) {
  return {
    id: m.id,
    projectId: m.project_id,
    key: m.key,
    url: m.url,
    filename: m.filename,
    size: m.size,
    width: m.width,
    height: m.height,
    mimeType: m.mime_type,
    uploadedBy: m.uploaded_by,
    createdAt: m.created_at,
  };
}

export default app;
