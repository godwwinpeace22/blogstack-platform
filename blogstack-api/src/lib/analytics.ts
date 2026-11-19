import { documentLinks, safeUrl } from "@blogstack/core";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { z } from "zod/v4";
import { accountAccess } from "./entitlements.js";
import { rateLimitKey } from "./rate-limit.js";
import { projectBlogUrl } from "./links.js";
import type { Bindings, HonoEnv, DbPost, DbProject } from "../types.js";
const eventSchema = z.object({
  postId: z.string().max(100),
  type: z.enum(["view", "click"]),
  destination: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  preview: z.boolean().optional(),
});
export async function collectEvent(c: Context<HonoEnv>, project: DbProject) {
  c.header("Cache-Control", "no-store");
  if (!c.env.ANALYTICS)
    return c.json(
      {
        error: "Analytics is temporarily unavailable",
        code: "SERVICE_UNAVAILABLE",
      },
      503,
    );
  const raw = await c.req.text();
  if (raw.length > 4096) return c.body(null, 413);
  let data: z.infer<typeof eventSchema>;
  try {
    data = eventSchema.parse(JSON.parse(raw));
  } catch {
    return c.body(null, 400);
  }
  const settings = JSON.parse(project.settings || "{}"),
    blogUrl = projectBlogUrl(project.settings);
  if (
    !blogUrl ||
    settings.analyticsEnabled === false ||
    data.preview ||
    c.req.header("dnt") === "1" ||
    c.req.header("sec-gpc") === "1"
  )
    return c.body(null, 204);
  const origin = c.req.header("origin");
  if (
    origin !== new URL(blogUrl).origin ||
    origin === new URL(c.env.FRONTEND_URL).origin
  )
    return c.body(null, 204);
  if (
    /bot|crawler|spider|headless|preview|lighthouse/i.test(
      c.req.header("user-agent") || "",
    )
  )
    return c.body(null, 204);
  if (
    c.env.EVENT_RATE_LIMIT &&
    !(
      await c.env.EVENT_RATE_LIMIT.limit({
        key: await rateLimitKey(
          c.env.BETTER_AUTH_SECRET,
          project.id,
          c.req.header("cf-connecting-ip") || "unknown",
        ),
      })
    ).success
  )
    return c.body(null, 429);
  const post = await c.env.MAIN_DB.prepare(
    "SELECT * FROM posts WHERE id=? AND project_id=? AND status='published'",
  )
    .bind(data.postId, project.id)
    .first<DbPost>();
  if (!post) return c.body(null, 204);
  let destination = "";
  if (data.type === "click") {
    const href = safeUrl(data.destination, true);
    if (!href) return c.body(null, 204);
    let url: URL;
    try {
      url = new URL(href, blogUrl + "/");
    } catch {
      return c.body(null, 204);
    }
    if (!documentLinks(post.content, blogUrl).some((l) => l.href === url.href))
      return c.body(null, 204);
    destination = (url.origin + url.pathname).slice(0, 512);
  }
  let referrer = "";
  try {
    referrer = new URL(data.referrer || "").hostname.slice(0, 150);
  } catch {
    /* direct visit */
  }
  c.env.ANALYTICS.writeDataPoint({
    indexes: [project.account_id],
    blobs: [project.id, post.id, data.type, referrer, destination],
    doubles: [1],
  });
  return c.body(null, 204);
}
interface DailyRow {
  project_id: string;
  day: string;
  post_id: string;
  kind: string;
  dimension: string;
  total: number;
  sampled: number;
}
function literal(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}
async function query(
  env: Bindings,
  sql: string,
): Promise<Record<string, unknown>[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN)
    throw new HTTPException(503, {
      message: "Analytics reports are temporarily unavailable",
    });
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" +
      encodeURIComponent(env.CF_ACCOUNT_ID) +
      "/analytics_engine/sql",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_ANALYTICS_TOKEN,
        "Content-Type": "text/plain",
      },
      body: sql,
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error("Analytics query failed: " + response.status);
  const result = await response.json<{ data?: Record<string, unknown>[] }>();
  if (!Array.isArray(result.data))
    throw new Error("Invalid analytics response");
  return result.data;
}
export async function snapshot(
  env: Bindings,
  projectId: string,
  day: string,
): Promise<DailyRow[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Invalid analytics day");
  const next = new Date(Date.parse(day + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const project = await env.MAIN_DB.prepare(
    "SELECT account_id FROM projects WHERE id=?",
  )
    .bind(projectId)
    .first<{ account_id: string }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const dataset = env.ANALYTICS_DATASET || "blogstack_events";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(dataset))
    throw new Error("Invalid analytics dataset name");
  const where =
    "index1=" +
    literal(project.account_id) +
    " AND blob1=" +
    literal(projectId) +
    " AND timestamp>=toDateTime(" +
    literal(day + " 00:00:00") +
    ") AND timestamp<toDateTime(" +
    literal(next + " 00:00:00") +
    ")";
  const metric =
    "SUM(_sample_interval * double1) AS total, MAX(_sample_interval) AS sample";
  const [totals, referrers, clicks] = await Promise.all([
    query(
      env,
      "SELECT blob2 AS post_id,blob3 AS kind," +
        metric +
        " FROM " +
        dataset +
        " WHERE " +
        where +
        " GROUP BY blob2,blob3 LIMIT 2500",
    ),
    query(
      env,
      "SELECT blob4 AS dimension," +
        metric +
        " FROM " +
        dataset +
        " WHERE " +
        where +
        " AND blob3='view' GROUP BY blob4 ORDER BY total DESC LIMIT 100",
    ),
    query(
      env,
      "SELECT blob2 AS post_id,blob5 AS dimension," +
        metric +
        " FROM " +
        dataset +
        " WHERE " +
        where +
        " AND blob3='click' GROUP BY blob2,blob5 ORDER BY total DESC LIMIT 5000",
    ),
  ]);
  const row = (
    r: Record<string, unknown>,
    kind: string,
    dimension: string,
  ): DailyRow => ({
    project_id: projectId,
    day,
    post_id: String(r.post_id ?? ""),
    kind,
    dimension,
    total: Number(r.total) || 0,
    sampled: Number(r.sample) > 1 ? 1 : 0,
  });
  return [
    ...totals.map((r) => row(r, String(r.kind), "")),
    ...referrers.map((r) =>
      row(r, "referrer", String(r.dimension || "direct")),
    ),
    ...clicks.map((r) => row(r, "destination", String(r.dimension || ""))),
  ];
}
export async function persistSnapshot(
  env: Bindings,
  projectId: string,
  day: string,
) {
  const rows = await snapshot(env, projectId, day);
  const statements = [
    env.MAIN_DB.prepare(
      "DELETE FROM analytics_daily WHERE project_id=? AND day=?",
    ).bind(projectId, day),
  ];
  // Stay below D1's 100 bindings per statement and reduce statement overhead for busy blogs.
  for (let offset = 0; offset < rows.length; offset += 12) {
    const group = rows.slice(offset, offset + 12);
    statements.push(
      env.MAIN_DB.prepare(
        "INSERT INTO analytics_daily(project_id,day,post_id,kind,dimension,total,sampled) VALUES" +
          group.map(() => "(?,?,?,?,?,?,?)").join(","),
      ).bind(
        ...group.flatMap((r) => [
          r.project_id,
          r.day,
          r.post_id,
          r.kind,
          r.dimension,
          r.total,
          r.sampled,
        ]),
      ),
    );
  }
  await env.MAIN_DB.batch(statements);
}
export async function analyticsReport(
  env: Bindings,
  projectId: string,
  requestedDays: number,
) {
  const project = await env.MAIN_DB.prepare(
    "SELECT account_id FROM projects WHERE id=?",
  )
    .bind(projectId)
    .first<{ account_id: string }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const access = await accountAccess(env, project.account_id);
  const days = Math.max(1, Math.min(access.analytics_days, requestedDays));
  const today = new Date().toISOString().slice(0, 10),
    from = new Date(Date.now() - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
  const stored = await env.MAIN_DB.prepare(
    "SELECT * FROM analytics_daily WHERE project_id=? AND day>=? AND day<?",
  )
    .bind(projectId, from, today)
    .all<DailyRow>();
  let recent: DailyRow[] = [],
    liveAvailable = true;
  try {
    recent = await snapshot(env, projectId, today);
  } catch {
    liveAvailable = false;
  }
  const rows = [...stored.results, ...recent],
    byDay = new Map<string, { day: string; views: number; clicks: number }>();
  const posts = new Map<
      string,
      { postId: string; views: number; clicks: number }
    >(),
    refs = new Map<string, number>(),
    destinations = new Map<string, number>();
  let views = 0,
    clicks = 0;
  for (const row of rows) {
    if (row.kind === "referrer") {
      refs.set(row.dimension, (refs.get(row.dimension) ?? 0) + row.total);
      continue;
    }
    if (row.kind === "destination") {
      destinations.set(
        row.dimension,
        (destinations.get(row.dimension) ?? 0) + row.total,
      );
      continue;
    }
    const daily = byDay.get(row.day) ?? { day: row.day, views: 0, clicks: 0 };
    const post = posts.get(row.post_id) ?? {
      postId: row.post_id,
      views: 0,
      clicks: 0,
    };
    if (row.kind === "view") {
      views += row.total;
      daily.views += row.total;
      post.views += row.total;
    }
    if (row.kind === "click") {
      clicks += row.total;
      daily.clicks += row.total;
      post.clicks += row.total;
    }
    byDay.set(row.day, daily);
    posts.set(row.post_id, post);
  }
  const sorted = (m: Map<string, number>) =>
    Array.from(m, ([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  const titles = await env.MAIN_DB.prepare(
    "SELECT id,title FROM posts WHERE project_id=?",
  )
    .bind(projectId)
    .all<{ id: string; title: string }>();
  return {
    from,
    to: today,
    days,
    historyDays: access.analytics_days,
    views,
    clicks,
    clicksPer100Views: views ? (100 * clicks) / views : 0,
    sampled: rows.some((r) => !!r.sampled),
    liveAvailable,
    updatedAt: Math.floor(Date.now() / 1000),
    daily: Array.from(byDay.values()).sort((a, b) =>
      a.day.localeCompare(b.day),
    ),
    posts: Array.from(posts.values())
      .map((p) => ({
        ...p,
        title:
          titles.results.find((t) => t.id === p.postId)?.title ??
          "Deleted article",
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 20),
    referrers: sorted(refs),
    destinations: sorted(destinations),
  };
}
