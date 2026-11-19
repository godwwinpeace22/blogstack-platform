import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import { slugify } from "../lib/slugify.js";
import type { HonoEnv, DbTag } from "../types.js";

const app = new Hono<HonoEnv>();

// GET /projects/:projectId/tags
app.get("/:projectId/tags", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "writer");

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM post_tags pt WHERE pt.tag_id = t.id) AS post_count
     FROM tags t
     WHERE t.project_id = ?
     ORDER BY post_count DESC, t.name ASC`,
  )
    .bind(projectId)
    .all<DbTag & { post_count: number }>();

  return c.json(
    rows.results.map((t) => ({
      id: t.id,
      projectId: t.project_id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      ogImage: t.og_image,
      postCount: t.post_count,
    })),
  );
});

// POST /projects/:projectId/tags
app.post(
  "/:projectId/tags",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .optional(),
      description: z.string().max(500).optional(),
      ogImage: z.url().optional(),
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
    assertProjectRole(role, "editor");

    const { name, slug: rawSlug, description, ogImage } = c.req.valid("json");
    const baseSlug = rawSlug ?? slugify(name);

    const conflict = await c.env.MAIN_DB.prepare(
      `SELECT id FROM tags WHERE project_id = ? AND slug = ?`,
    )
      .bind(projectId, baseSlug)
      .first();

    if (conflict) {
      return c.json(
        { error: "Tag slug already exists", code: "SLUG_CONFLICT" },
        409,
      );
    }

    const id = crypto.randomUUID();
    await c.env.MAIN_DB.prepare(
      `INSERT INTO tags (id, project_id, name, slug, description, og_image)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, projectId, name, baseSlug, description ?? null, ogImage ?? null)
      .run();

    const tag = await c.env.MAIN_DB.prepare(`SELECT * FROM tags WHERE id = ?`)
      .bind(id)
      .first<DbTag>();

    return c.json(
      {
        id: tag!.id,
        projectId: tag!.project_id,
        name: tag!.name,
        slug: tag!.slug,
        description: tag!.description,
        ogImage: tag!.og_image,
      },
      201,
    );
  },
);

// PATCH /projects/:projectId/tags/:tagId
app.patch(
  "/:projectId/tags/:tagId",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      ogImage: z.url().nullable().optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId, tagId } = c.req.param();

    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(role, "editor");

    const { name, description, ogImage } = c.req.valid("json");
    const updates: string[] = [];
    const bindings: unknown[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      bindings.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      bindings.push(description);
    }
    if (ogImage !== undefined) {
      updates.push("og_image = ?");
      bindings.push(ogImage);
    }

    if (updates.length > 0) {
      bindings.push(tagId, projectId);
      await c.env.MAIN_DB.prepare(
        `UPDATE tags SET ${updates.join(", ")} WHERE id = ? AND project_id = ?`,
      )
        .bind(...bindings)
        .run();
    }

    const tag = await c.env.MAIN_DB.prepare(
      `SELECT * FROM tags WHERE id = ? AND project_id = ?`,
    )
      .bind(tagId, projectId)
      .first<DbTag>();

    if (!tag) return c.json({ error: "Tag not found", code: "NOT_FOUND" }, 404);

    return c.json({
      id: tag.id,
      projectId: tag.project_id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      ogImage: tag.og_image,
    });
  },
);

// DELETE /projects/:projectId/tags/:tagId
app.delete("/:projectId/tags/:tagId", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId, tagId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "editor");

  const result = await c.env.MAIN_DB.prepare(
    `DELETE FROM tags WHERE id = ? AND project_id = ?`,
  )
    .bind(tagId, projectId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Tag not found", code: "NOT_FOUND" }, 404);
  }

  return c.body(null, 204);
});

// POST /projects/:projectId/tags/merge
app.post(
  "/:projectId/tags/merge",
  requireAuth,
  zValidator(
    "json",
    z.object({
      sourceId: z.string(),
      targetId: z.string(),
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
    assertProjectRole(role, "editor");

    const { sourceId, targetId } = c.req.valid("json");

    if (sourceId === targetId) {
      return c.json(
        {
          error: "sourceId and targetId must be different",
          code: "INVALID_INPUT",
        },
        400,
      );
    }

    const tags = await c.env.MAIN_DB.prepare(
      `SELECT id FROM tags WHERE project_id = ? AND id IN (?, ?)`,
    )
      .bind(projectId, sourceId, targetId)
      .all();
    if (tags.results.length !== 2)
      return c.json(
        { error: "Both tags must belong to this project", code: "NOT_FOUND" },
        404,
      );

    // Transfer all post-tag associations from source → target (avoiding duplicates)
    // then delete the source tag
    await c.env.MAIN_DB.batch([
      c.env.MAIN_DB.prepare(
        `INSERT OR IGNORE INTO post_tags (post_id, tag_id)
         SELECT post_id, ? FROM post_tags WHERE tag_id = ?`,
      ).bind(targetId, sourceId),
      c.env.MAIN_DB.prepare(`DELETE FROM post_tags WHERE tag_id = ?`).bind(
        sourceId,
      ),
      c.env.MAIN_DB.prepare(
        `DELETE FROM tags WHERE id = ? AND project_id = ?`,
      ).bind(sourceId, projectId),
    ]);

    const target = await c.env.MAIN_DB.prepare(
      `SELECT * FROM tags WHERE id = ? AND project_id = ?`,
    )
      .bind(targetId, projectId)
      .first<DbTag>();

    if (!target)
      return c.json({ error: "Target tag not found", code: "NOT_FOUND" }, 404);

    const postCount = await c.env.MAIN_DB.prepare(
      `SELECT COUNT(*) AS cnt FROM post_tags WHERE tag_id = ?`,
    )
      .bind(targetId)
      .first<{ cnt: number }>();

    return c.json({
      id: target.id,
      projectId: target.project_id,
      name: target.name,
      slug: target.slug,
      description: target.description,
      ogImage: target.og_image,
      postCount: postCount?.cnt ?? 0,
    });
  },
);

export default app;
