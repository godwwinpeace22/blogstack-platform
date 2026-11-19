import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PLANS, articleUrl } from "@blogstack/core";
import { postSummary } from "../lib/post-summary.js";
import { pagination, encodeCursor } from "../lib/pagination.js";
import { requirePublicDelivery, accountAccess } from "../lib/entitlements.js";
import { projectBlogUrl } from "../lib/links.js";
import { collectEvent } from "../lib/analytics.js";
import type { HonoEnv, DbPost, DbProject } from "../types.js";
const app = new Hono<HonoEnv>();
const xml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
async function project(c: {
  env: HonoEnv["Bindings"];
  req: { param: (name: string) => string | undefined };
}) {
  const p = await c.env.MAIN_DB.prepare("SELECT * FROM projects WHERE slug=?")
    .bind(c.req.param("projectSlug")!)
    .first<DbProject>();
  if (!p) throw new HTTPException(404, { message: "Blog not found" });
  await requirePublicDelivery(c.env, p.account_id);
  return p;
}
function serialize(
  p: DbPost & { author_name?: string | null; author_avatar?: string | null },
  blog: DbProject,
) {
  const summary = postSummary(p.rendered_html),
    blogUrl = projectBlogUrl(blog.settings);
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    renderedHtml: p.rendered_html,
    publishedAt: p.published_at,
    updatedAt: p.updated_at,
    ...summary,
    excerpt: p.excerpt ?? summary.excerpt,
    coverImage: p.cover_image ?? summary.coverImage,
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    canonicalUrl:
      p.canonical_url || (blogUrl ? articleUrl(blogUrl, p.slug) : null),
    url: blogUrl ? articleUrl(blogUrl, p.slug) : null,
    noIndex: !!p.no_index,
    author: {
      id: p.author_id,
      name: p.author_name ?? null,
      avatarUrl: p.author_avatar ?? null,
    },
  };
}
app.get("/plans", (c) =>
  c.json({ currency: "USD", trialDays: 14, plans: PLANS }),
);
app.get("/:projectSlug", async (c) => {
  const p = await project(c),
    settings = JSON.parse(p.settings || "{}"),
    access = await accountAccess(c.env, p.account_id),
    custom = PLANS[access.plan].customBranding;
  return c.json({
    name: p.name,
    slug: p.slug,
    blogUrl: projectBlogUrl(p.settings),
    analyticsEnabled: settings.analyticsEnabled !== false,
    branding: {
      showAttribution: !custom || !settings.hideAttribution,
      workspaceName: custom ? settings.workspaceName || p.name : "BlogStack",
      logoUrl: custom ? (settings.logoUrl ?? null) : null,
    },
  });
});
app.get("/:projectSlug/posts", async (c) => {
  const p = await project(c),
    { cursor, limit } = pagination(c.req.query(), 20, 100),
    conditions = ["p.project_id=?", "p.status='published'"],
    values: unknown[] = [p.id];
  const tag = c.req.query("tag"),
    q = c.req.query("q");
  if (tag) {
    conditions.push(
      "EXISTS(SELECT 1 FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id AND t.slug=?)",
    );
    values.push(tag);
  }
  if (q) {
    conditions.push("p.title LIKE ?");
    values.push("%" + q + "%");
  }
  const total = await c.env.MAIN_DB.prepare(
    "SELECT COUNT(*) AS cnt FROM posts p WHERE " + conditions.join(" AND "),
  )
    .bind(...values)
    .first<{ cnt: number }>();
  if (cursor) {
    conditions.push("(p.published_at<? OR (p.published_at=? AND p.id<?))");
    values.push(cursor.time, cursor.time, cursor.id);
  }
  const rows = await c.env.MAIN_DB.prepare(
    "SELECT p.*,u.name AS author_name,u.image AS author_avatar FROM posts p JOIN users u ON u.id=p.author_id WHERE " +
      conditions.join(" AND ") +
      " ORDER BY p.published_at DESC,p.id DESC LIMIT ?",
  )
    .bind(...values, limit + 1)
    .all<DbPost>();
  const items = rows.results.slice(0, limit);
  c.header("Cache-Control", "no-store");
  return c.json({
    data: items.map((post) => serialize(post, p)),
    total: total?.cnt ?? 0,
    nextCursor:
      rows.results.length > limit
        ? encodeCursor(items.at(-1)!.published_at!, items.at(-1)!.id)
        : null,
  });
});
app.get("/:projectSlug/posts/:slug", async (c) => {
  const p = await project(c);
  const post = await c.env.MAIN_DB.prepare(
    "SELECT p.*,u.name AS author_name,u.image AS author_avatar FROM posts p JOIN users u ON u.id=p.author_id WHERE p.project_id=? AND p.slug=? AND p.status='published'",
  )
    .bind(p.id, c.req.param("slug"))
    .first<DbPost>();
  if (!post) throw new HTTPException(404, { message: "Article not found" });
  const tags = await c.env.MAIN_DB.prepare(
    "SELECT t.id,t.name,t.slug,t.description FROM tags t JOIN post_tags pt ON pt.tag_id=t.id WHERE pt.post_id=?",
  )
    .bind(post.id)
    .all();
  c.header("Cache-Control", "no-store");
  return c.json({ ...serialize(post, p), tags: tags.results });
});
app.get("/:projectSlug/tags", async (c) => {
  const p = await project(c);
  const tags = await c.env.MAIN_DB.prepare(
    "SELECT t.id,t.name,t.slug,t.description,COUNT(p.id) AS postCount FROM tags t LEFT JOIN post_tags pt ON pt.tag_id=t.id LEFT JOIN posts p ON p.id=pt.post_id AND p.status='published' WHERE t.project_id=? GROUP BY t.id ORDER BY t.name",
  )
    .bind(p.id)
    .all();
  return c.json(tags.results);
});
app.get("/:projectSlug/feed.xml", async (c) => {
  const p = await project(c),
    base = projectBlogUrl(p.settings);
  if (JSON.parse(p.settings || "{}").rssEnabled === false)
    throw new HTTPException(404, { message: "RSS is disabled" });
  if (!base)
    throw new HTTPException(409, {
      message: "The blog website URL has not been configured",
    });
  const posts = await c.env.MAIN_DB.prepare(
    "SELECT * FROM posts WHERE project_id=? AND status='published' ORDER BY published_at DESC LIMIT 50",
  )
    .bind(p.id)
    .all<DbPost>();
  const items = posts.results
    .map(
      (post) =>
        '<item><guid isPermaLink="true">' +
        xml(articleUrl(base, post.slug)) +
        "</guid><title>" +
        xml(post.title) +
        "</title><link>" +
        xml(articleUrl(base, post.slug)) +
        "</link><pubDate>" +
        new Date(post.published_at! * 1000).toUTCString() +
        "</pubDate><description>" +
        xml(post.excerpt || postSummary(post.rendered_html).excerpt) +
        "</description></item>",
    )
    .join("");
  return c.text(
    '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>' +
      xml(p.name) +
      "</title><link>" +
      xml(base) +
      "</link><description>" +
      xml(p.name) +
      "</description>" +
      items +
      "</channel></rss>",
    200,
    {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  );
});
app.get("/:projectSlug/sitemap.xml", async (c) => {
  const p = await project(c),
    base = projectBlogUrl(p.settings);
  if (JSON.parse(p.settings || "{}").sitemapEnabled === false)
    throw new HTTPException(404, { message: "The blog sitemap is disabled" });
  if (!base)
    throw new HTTPException(409, {
      message: "The blog website URL has not been configured",
    });
  const posts = await c.env.MAIN_DB.prepare(
    "SELECT slug,updated_at FROM posts WHERE project_id=? AND status='published' AND no_index=0",
  )
    .bind(p.id)
    .all<{ slug: string; updated_at: number }>();
  return c.text(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      posts.results
        .map(
          (post) =>
            "<url><loc>" +
            xml(articleUrl(base, post.slug)) +
            "</loc><lastmod>" +
            new Date(post.updated_at * 1000).toISOString() +
            "</lastmod></url>",
        )
        .join("") +
      "</urlset>",
    200,
    {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  );
});
app.post("/:projectSlug/events", async (c) =>
  collectEvent(c, await project(c)),
);
export default app;
