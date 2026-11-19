import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { HTTPException } from "hono/http-exception";
import { safeUrl } from "@blogstack/core";
import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
  getAccountRole,
  assertAccountRole,
} from "../lib/permissions.js";
import { accountAccess, limitsFor } from "../lib/entitlements.js";
import { slugify } from "../lib/slugify.js";
import type { DbProject, HonoEnv } from "../types.js";

export const projectSettings = z.object({
  blogUrl: z
    .string()
    .max(2048)
    .refine((value) => {
      if (!safeUrl(value)) return false;
      const u = new URL(value);
      return (
        !u.search &&
        !u.hash &&
        (u.protocol === "https:" ||
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
      );
    }, "Use an HTTPS blog URL without query parameters or a fragment (HTTP is allowed for localhost)")
    .transform((v) => v.replace(/\/+$/, ""))
    .optional(),
  ogImage: z
    .string()
    .max(2048)
    .refine((value) => !!safeUrl(value))
    .nullable()
    .optional(),
  robotsTxt: z.string().max(4000).nullable().optional(),
  sitemapEnabled: z.boolean().optional(),
  rssEnabled: z.boolean().optional(),
  hideAttribution: z.boolean().optional(),
  workspaceName: z.string().trim().min(1).max(80).optional(),
  logoUrl: z
    .string()
    .max(2048)
    .refine((value) => !!safeUrl(value))
    .nullable()
    .optional(),
  analyticsEnabled: z.boolean().optional(),
});
const app = new Hono<HonoEnv>();
async function serialize(
  p: DbProject,
  c: Parameters<typeof accountAccess>[0],
  userId: string,
) {
  const access = await accountAccess(c, p.account_id),
    settings = JSON.parse(p.settings || "{}"),
    custom = limitsFor(access).customBranding;
  return {
    id: p.id,
    accountId: p.account_id,
    name: p.name,
    slug: p.slug,
    createdBy: p.created_by,
    createdAt: p.created_at,
    settings,
    canCustomizeBranding: custom,
    role: await getEffectiveProjectRole(c.MAIN_DB, userId, p.id),
    canWrite: !!access.writable,
    branding: {
      showAttribution: !custom || !settings.hideAttribution,
      workspaceName: custom ? settings.workspaceName || p.name : "BlogStack",
      logoUrl: custom ? settings.logoUrl || null : null,
    },
  };
}
app.get("/", requireAuth, async (c) => {
  const user = c.var.userId;
  const rows = await c.env.MAIN_DB.prepare(
    "SELECT DISTINCT p.* FROM projects p WHERE EXISTS(SELECT 1 FROM accounts a WHERE a.id=p.account_id AND a.owner_id=?) OR EXISTS(SELECT 1 FROM account_members m WHERE m.account_id=p.account_id AND m.user_id=? AND m.joined_at IS NOT NULL) OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=? AND m.joined_at IS NOT NULL) ORDER BY p.created_at DESC",
  )
    .bind(user, user, user)
    .all<DbProject>();
  return c.json(
    await Promise.all(rows.results.map((p) => serialize(p, c.env, user))),
  );
});
app.post(
  "/",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(100),
      slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/)
        .optional(),
      settings: projectSettings.optional(),
    }),
  ),
  async (c) => {
    assertAccountRole(
      await getAccountRole(c.env.MAIN_DB, c.var.userId, c.var.accountId),
      "account_admin",
    );
    const input = c.req.valid("json"),
      id = crypto.randomUUID(),
      base = input.slug || slugify(input.name) || "blog";
    let slug = base,
      n = 1;
    while (
      await c.env.MAIN_DB.prepare("SELECT id FROM projects WHERE slug=?")
        .bind(slug)
        .first()
    )
      slug = base + "-" + n++;
    const now = Math.floor(Date.now() / 1000);
    await c.env.MAIN_DB.prepare(
      "INSERT INTO projects(id,account_id,name,slug,created_by,created_at,settings) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        c.var.accountId,
        input.name,
        slug,
        c.var.userId,
        now,
        JSON.stringify({ analyticsEnabled: false, ...input.settings }),
      )
      .run();
    return c.json(
      await serialize(
        (await c.env.MAIN_DB.prepare("SELECT * FROM projects WHERE id=?")
          .bind(id)
          .first<DbProject>())!,
        c.env,
        c.var.userId,
      ),
      201,
    );
  },
);
app.get("/:projectId", requireAuth, async (c) => {
  const id = c.req.param("projectId");
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, id),
    "writer",
  );
  const project = await c.env.MAIN_DB.prepare(
    "SELECT * FROM projects WHERE id=?",
  )
    .bind(id)
    .first<DbProject>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  return c.json(await serialize(project, c.env, c.var.userId));
});
app.patch(
  "/:projectId",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      settings: projectSettings.optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("projectId");
    assertProjectRole(
      await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, id),
      "project_admin",
    );
    const p = await c.env.MAIN_DB.prepare("SELECT * FROM projects WHERE id=?")
      .bind(id)
      .first<DbProject>();
    if (!p) throw new HTTPException(404, { message: "Project not found" });
    const input = c.req.valid("json");
    const access = await accountAccess(c.env, p.account_id);
    if (
      !limitsFor(access).customBranding &&
      (input.settings?.hideAttribution ||
        input.settings?.workspaceName ||
        input.settings?.logoUrl)
    )
      throw new HTTPException(403, {
        message: "Agency branding is included on Studio and Growth",
      });
    await c.env.MAIN_DB.prepare(
      "UPDATE projects SET name=?,settings=?,updated_at=unixepoch() WHERE id=?",
    )
      .bind(
        input.name ?? p.name,
        JSON.stringify({
          ...JSON.parse(p.settings || "{}"),
          ...input.settings,
        }),
        id,
      )
      .run();
    return c.json(
      await serialize(
        (await c.env.MAIN_DB.prepare("SELECT * FROM projects WHERE id=?")
          .bind(id)
          .first<DbProject>())!,
        c.env,
        c.var.userId,
      ),
    );
  },
);
app.delete("/:projectId", requireAuth, async (c) => {
  const id = c.req.param("projectId");
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, id),
    "project_admin",
  );
  const result = await c.env.MAIN_DB.prepare("DELETE FROM projects WHERE id=?")
    .bind(id)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(404, { message: "Project not found" });
  return c.body(null, 204);
});
app.get("/:projectId/stats", requireAuth, async (c) => {
  const id = c.req.param("projectId");
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, id),
    "writer",
  );
  const [posts, media, views] = await c.env.MAIN_DB.batch<{
    total: number;
    published?: number;
    draft?: number;
    monthly?: number;
  }>([
    c.env.MAIN_DB.prepare(
      "SELECT COUNT(*) AS total,SUM(status='published') AS published,SUM(status='draft') AS draft FROM posts WHERE project_id=?",
    ).bind(id),
    c.env.MAIN_DB.prepare(
      "SELECT COUNT(*) AS total FROM media WHERE project_id=? AND confirmed=1",
    ).bind(id),
    c.env.MAIN_DB.prepare(
      "SELECT COALESCE(SUM(total),0) AS total,COALESCE(SUM(CASE WHEN day>=date('now','-30 days') THEN total ELSE 0 END),0) AS monthly FROM analytics_daily WHERE project_id=? AND kind='view' AND dimension=''",
    ).bind(id),
  ]);
  return c.json({
    postCount: posts!.results[0]?.total ?? 0,
    publishedCount: posts!.results[0]?.published ?? 0,
    draftCount: posts!.results[0]?.draft ?? 0,
    scheduledCount: 0,
    mediaCount: media!.results[0]?.total ?? 0,
    totalViews: views!.results[0]?.total ?? 0,
    viewsThisMonth: views!.results[0]?.monthly ?? 0,
  });
});
app.get("/:projectId/export", requireAuth, async (c) => {
  if (c.var.apiKey)
    throw new HTTPException(403, { message: "Export requires a user session" });
  const id = c.req.param("projectId");
  assertProjectRole(
    await getEffectiveProjectRole(c.env.MAIN_DB, c.var.userId, id),
    "project_admin",
  );
  const [project, posts, drafts, tags, media, postTags] = await Promise.all([
    c.env.MAIN_DB.prepare("SELECT * FROM projects WHERE id=?").bind(id).first(),
    c.env.MAIN_DB.prepare("SELECT * FROM posts WHERE project_id=?")
      .bind(id)
      .all(),
    c.env.MAIN_DB.prepare(
      "SELECT d.* FROM post_drafts d JOIN posts p ON p.id=d.post_id WHERE p.project_id=?",
    )
      .bind(id)
      .all(),
    c.env.MAIN_DB.prepare("SELECT * FROM tags WHERE project_id=?")
      .bind(id)
      .all(),
    c.env.MAIN_DB.prepare(
      "SELECT * FROM media WHERE project_id=? AND confirmed=1",
    )
      .bind(id)
      .all<{ id: string }>(),
    c.env.MAIN_DB.prepare(
      "SELECT pt.post_id AS postId,pt.tag_id AS tagId FROM post_tags pt JOIN posts p ON p.id=pt.post_id WHERE p.project_id=?",
    )
      .bind(id)
      .all(),
  ]);
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Disposition",
    'attachment; filename="blogstack-' + id + '.json"',
  );
  return c.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    posts: posts.results,
    drafts: drafts.results,
    tags: tags.results,
    postTags: postTags.results,
    media: media.results.map((m) => ({
      ...m,
      downloadPath: "/projects/" + id + "/media/" + m.id + "/download",
    })),
  });
});
export default app;
