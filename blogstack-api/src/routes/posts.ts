import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import {
  assertProjectRole,
  getEffectiveProjectRole,
} from "../lib/permissions.js";
import { pagination, encodeCursor } from "../lib/pagination.js";
import {
  articleFields,
  getDraft,
  saveDraft,
  serializeDraft,
  validateTags,
  type DraftRow,
} from "../lib/drafts.js";
import { slugify } from "../lib/slugify.js";
import { renderBlockNote } from "../lib/render.js";
import { notifyJob } from "../lib/jobs.js";
import { projectBlogUrl, refreshInternalLinks } from "../lib/links.js";
import type { HonoEnv, DbPost } from "../types.js";

const app = new Hono<HonoEnv>();
app.get("/:projectId/posts", requireAuth, async (c) => {
  const projectId = c.req.param("projectId");
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "writer",
  );
  const { cursor, limit } = pagination(c.req.query(), 20, 100);
  const conditions = ["p.project_id=?"],
    values: unknown[] = [projectId];
  const status = c.req.query("status"),
    q = c.req.query("q"),
    tag = c.req.query("tag");
  if (status) {
    if (!["draft", "published"].includes(status))
      throw new HTTPException(400, { message: "Invalid post status" });
    conditions.push("p.status=?");
    values.push(status);
  }
  if (q) {
    conditions.push("d.title LIKE ?");
    values.push("%" + q + "%");
  }
  if (tag) {
    conditions.push(
      "EXISTS(SELECT 1 FROM tags t,json_each(d.tag_ids) j WHERE t.id=j.value AND t.project_id=p.project_id AND t.slug=?)",
    );
    values.push(tag);
  }
  const where = conditions.join(" AND ");
  const total = await c.env.MAIN_DB.prepare(
    "SELECT COUNT(*) AS cnt FROM posts p JOIN post_drafts d ON d.post_id=p.id WHERE " +
      where,
  )
    .bind(...values)
    .first<{ cnt: number }>();
  if (cursor) {
    conditions.push("(p.created_at<? OR (p.created_at=? AND p.id<?))");
    values.push(cursor.time, cursor.time, cursor.id);
  }
  const posts = await c.env.MAIN_DB.prepare(
    "SELECT p.* FROM posts p JOIN post_drafts d ON d.post_id=p.id WHERE " +
      conditions.join(" AND ") +
      " ORDER BY p.created_at DESC,p.id DESC LIMIT ?",
  )
    .bind(...values, limit + 1)
    .all<DbPost>();
  const items = posts.results.slice(0, limit);
  const drafts = items.length
    ? await c.env.MAIN_DB.prepare(
        "SELECT * FROM post_drafts WHERE post_id IN (" +
          items.map(() => "?").join(",") +
          ")",
      )
        .bind(...items.map((p) => p.id))
        .all<DraftRow>()
    : { results: [] };
  const map = new Map(drafts.results.map((d) => [d.post_id, d]));
  return c.json({
    data: items.map((p) => serializeDraft(p, map.get(p.id)!)),
    total: total?.cnt ?? 0,
    nextCursor:
      posts.results.length > limit
        ? encodeCursor(items.at(-1)!.created_at, items.at(-1)!.id)
        : null,
  });
});
app.post(
  "/:projectId/posts",
  requireAuth,
  zValidator(
    "json",
    articleFields
      .partial()
      .extend({ title: z.string().trim().min(1).max(500) }),
  ),
  async (c) => {
    const projectId = c.req.param("projectId");
    assertProjectRole(
      await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
      "writer",
    );
    const data = c.req.valid("json"),
      id = crypto.randomUUID(),
      now = Math.floor(Date.now() / 1000);
    const base = data.slug || slugify(data.title) || "untitled";
    let slug = base,
      index = 1;
    while (
      await c.env.MAIN_DB.prepare(
        "SELECT p.id FROM posts p JOIN post_drafts d ON d.post_id=p.id WHERE p.project_id=? AND (p.slug=? OR d.slug=?)",
      )
        .bind(projectId, slug, slug)
        .first()
    )
      slug = base + "-" + index++;
    await validateTags(c.env, projectId, data.tagIds ?? []);
    await c.env.MAIN_DB.batch([
      c.env.MAIN_DB.prepare(
        "INSERT INTO posts(id,project_id,title,slug,content,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        projectId,
        data.title,
        slug,
        data.content ?? "[]",
        c.var.userId,
        now,
        now,
      ),
      c.env.MAIN_DB.prepare(
        "UPDATE post_drafts SET excerpt=?,cover_image=?,seo_title=?,seo_description=?,canonical_url=?,no_index=?,primary_keyword=?,tag_ids=? WHERE post_id=?",
      ).bind(
        data.excerpt ?? null,
        data.coverImage ?? null,
        data.seoTitle ?? null,
        data.seoDescription ?? null,
        data.canonicalUrl ?? null,
        data.noIndex ? 1 : 0,
        data.primaryKeyword ?? null,
        JSON.stringify(data.tagIds ?? []),
        id,
      ),
    ]);
    const post = await c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE id=?")
      .bind(id)
      .first<DbPost>();
    return c.json(
      serializeDraft(post!, (await getDraft(c.env, id, projectId))!),
      201,
    );
  },
);
app.get("/:projectId/posts/:postId", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "writer",
  );
  const [post, draft] = await Promise.all([
    c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE id=? AND project_id=?")
      .bind(postId, projectId)
      .first<DbPost>(),
    getDraft(c.env, postId, projectId),
  ]);
  if (!post || !draft)
    throw new HTTPException(404, { message: "Post not found" });
  const [tags, author] = await Promise.all([
    c.env.MAIN_DB.prepare(
      "SELECT id,project_id AS projectId,name,slug,description,og_image AS ogImage FROM tags WHERE project_id=? AND id IN (SELECT value FROM json_each(?))",
    )
      .bind(projectId, draft.tag_ids)
      .all(),
    c.env.MAIN_DB.prepare(
      "SELECT id,email,name,image AS avatarUrl FROM users WHERE id=?",
    )
      .bind(post.author_id)
      .first(),
  ]);
  return c.json({ ...serializeDraft(post, draft), tags: tags.results, author });
});
app.patch(
  "/:projectId/posts/:postId",
  requireAuth,
  zValidator(
    "json",
    articleFields.partial().extend({ revision: z.number().int().positive() }),
  ),
  async (c) => {
    const { projectId, postId } = c.req.param();
    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      c.var.userId,
      projectId,
    );
    assertProjectRole(role, "writer");
    const post = await c.env.MAIN_DB.prepare(
      "SELECT * FROM posts WHERE id=? AND project_id=?",
    )
      .bind(postId, projectId)
      .first<DbPost>();
    if (!post) throw new HTTPException(404, { message: "Post not found" });
    if (role === "writer" && post.author_id !== c.var.userId)
      throw new HTTPException(403, {
        message: "Writers can edit their own posts only",
      });
    const { revision, ...changes } = c.req.valid("json");
    return c.json(
      serializeDraft(post, await saveDraft(c.env, post, changes, revision)),
    );
  },
);
app.post("/:projectId/posts/:postId/publish", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "editor",
  );
  const post = await c.env.MAIN_DB.prepare(
    "SELECT * FROM posts WHERE id=? AND project_id=?",
  )
    .bind(postId, projectId)
    .first<DbPost>();
  const draft = await getDraft(c.env, postId, projectId);
  if (!post || !draft)
    throw new HTTPException(404, { message: "Post not found" });
  const raw = await c.req.text();
  const body = raw
    ? z.object({ revision: z.number().int().positive() }).parse(JSON.parse(raw))
    : null;
  if (body && body.revision !== draft.revision)
    throw new HTTPException(409, {
      message: "The draft changed before publishing",
    });
  // Render before touching the publication. The compare-and-swap below also
  // protects against saves that complete while rendering is in flight.
  const project = await c.env.MAIN_DB.prepare(
    "SELECT settings FROM projects WHERE id=?",
  )
    .bind(projectId)
    .first<{ settings: string }>();
  if (!projectBlogUrl(project?.settings ?? null))
    throw new HTTPException(409, {
      message: "Set the website blog URL in project settings before publishing",
    });
  const rendered = await renderBlockNote(draft.content);
  await validateTags(c.env, projectId, JSON.parse(draft.tag_ids));
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    c.env.MAIN_DB.prepare(
      "UPDATE posts SET title=?,slug=?,content=?,rendered_html=?,excerpt=?,cover_image=?,seo_title=?,seo_description=?,canonical_url=?,no_index=?,primary_keyword=?,status='published',ever_published=1,published_revision=?,published_at=COALESCE(published_at,?),scheduled_at=NULL,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM post_drafts WHERE post_id=? AND revision=?)",
    ).bind(
      draft.title,
      draft.slug,
      draft.content,
      rendered,
      draft.excerpt,
      draft.cover_image,
      draft.seo_title,
      draft.seo_description,
      draft.canonical_url,
      draft.no_index,
      draft.primary_keyword,
      draft.revision,
      now,
      now,
      postId,
      postId,
      draft.revision,
    ),
    c.env.MAIN_DB.prepare(
      "DELETE FROM post_tags WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND published_revision=?)",
    ).bind(postId, postId, draft.revision),
    c.env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO background_jobs(id,kind,payload) SELECT ?,\'index_post\',? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND published_revision=?)",
    ).bind(
      "index:" + postId + ":" + draft.revision,
      JSON.stringify({ postId }),
      postId,
      draft.revision,
    ),
    ...JSON.parse(draft.tag_ids).map((id: string) =>
      c.env.MAIN_DB.prepare(
        "INSERT OR IGNORE INTO post_tags(post_id,tag_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND published_revision=?)",
      ).bind(postId, id, postId, draft.revision),
    ),
  ];
  const result = await c.env.MAIN_DB.batch(statements);
  if (!result[0]?.meta.changes)
    throw new HTTPException(409, {
      message: "The draft changed before publishing",
    });
  const updated = await c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE id=?")
    .bind(postId)
    .first<DbPost>();
  // Indexing derives from the committed publication, never an unpublished draft.
  c.executionCtx.waitUntil(
    notifyJob(c.env, "index:" + postId + ":" + draft.revision),
  );
  return c.json(serializeDraft(updated!, draft));
});
app.post("/:projectId/posts/:postId/unpublish", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "editor",
  );
  const result = await c.env.MAIN_DB.prepare(
    "UPDATE posts SET status='draft',published_at=NULL,scheduled_at=NULL,updated_at=unixepoch() WHERE id=? AND project_id=?",
  )
    .bind(postId, projectId)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(404, { message: "Post not found" });
  await c.env.MAIN_DB.prepare("DELETE FROM post_links WHERE post_id=?")
    .bind(postId)
    .run();
  // Resolve normalized article destinations without D1's short LIKE-pattern limit.
  await refreshInternalLinks(c.env, projectId);
  const post = await c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE id=?")
    .bind(postId)
    .first<DbPost>();
  return c.json(
    serializeDraft(post!, (await getDraft(c.env, postId, projectId))!),
  );
});
app.delete("/:projectId/posts/:postId", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "editor",
  );
  const result = await c.env.MAIN_DB.prepare(
    "DELETE FROM posts WHERE id=? AND project_id=?",
  )
    .bind(postId, projectId)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(404, { message: "Post not found" });
  return c.body(null, 204);
});
app.get("/:projectId/posts/:postId/preview", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "writer",
  );
  const draft = await getDraft(c.env, postId, projectId);
  if (!draft) throw new HTTPException(404, { message: "Post not found" });
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  return c.json({
    revision: draft.revision,
    renderedHtml: await renderBlockNote(draft.content),
  });
});
app.post("/:projectId/posts/:postId/duplicate", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "writer",
  );
  const draft = await getDraft(c.env, postId, projectId);
  if (!draft) throw new HTTPException(404, { message: "Post not found" });
  const id = crypto.randomUUID(),
    slug = draft.slug + "-copy-" + id.slice(0, 8),
    now = Math.floor(Date.now() / 1000);
  await c.env.MAIN_DB.batch([
    c.env.MAIN_DB.prepare(
      "INSERT INTO posts(id,project_id,title,slug,content,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      projectId,
      draft.title + " (Copy)",
      slug,
      draft.content,
      c.var.userId,
      now,
      now,
    ),
    c.env.MAIN_DB.prepare(
      "UPDATE post_drafts SET excerpt=?,cover_image=?,seo_title=?,seo_description=?,canonical_url=?,no_index=?,primary_keyword=?,tag_ids=? WHERE post_id=?",
    ).bind(
      draft.excerpt,
      draft.cover_image,
      draft.seo_title,
      draft.seo_description,
      draft.canonical_url,
      draft.no_index,
      draft.primary_keyword,
      draft.tag_ids,
      id,
    ),
  ]);
  const post = await c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE id=?")
    .bind(id)
    .first<DbPost>();
  return c.json(
    serializeDraft(post!, (await getDraft(c.env, id, projectId))!),
    201,
  );
});
app.post("/:projectId/posts/:postId/schedule", requireAuth, async (c) => {
  const { projectId, postId } = c.req.param();
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, projectId),
    "editor",
  );
  if (!(await getDraft(c.env, postId, projectId)))
    throw new HTTPException(404, { message: "Post not found" });
  return c.json(
    {
      error: "Scheduled publishing is not available in this release",
      code: "FEATURE_UNAVAILABLE",
    },
    409,
  );
});
export default app;
