import { documentLinks, articleUrl, PLANS, safeUrl } from "@blogstack/core";
import { HTTPException } from "hono/http-exception";
import {
  accountAccess,
  requireWritable,
  reserveUsage,
  settleUsage,
  usage,
} from "./entitlements.js";
import { enqueue } from "./jobs.js";
import type { Bindings, DbPost } from "../types.js";
export interface LinkResult {
  status: "healthy" | "broken" | "redirected" | "inconclusive" | "unsafe";
  httpStatus: number | null;
  finalUrl: string | null;
}
export function projectBlogUrl(settings: string | null): string | null {
  try {
    return safeUrl(JSON.parse(settings || "{}").blogUrl) || null;
  } catch {
    return null;
  }
}
export async function indexPostLinks(env: Bindings, post: DbPost) {
  const project = await env.MAIN_DB.prepare(
    "SELECT settings FROM projects WHERE id=?",
  )
    .bind(post.project_id)
    .first<{ settings: string }>();
  const blogUrl = projectBlogUrl(project?.settings ?? null);
  if (!blogUrl) return;
  const links = documentLinks(post.content, blogUrl).slice(0, 500);
  // One transaction makes the inventory correspond to the committed revision.
  const statements = [
    env.MAIN_DB.prepare(
      "DELETE FROM post_links WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND status='published' AND published_revision=?)",
    ).bind(post.id, post.id, post.published_revision),
  ];
  for (const link of links)
    statements.push(
      env.MAIN_DB.prepare(
        "INSERT INTO post_links(id,project_id,post_id,url,anchor,kind,status,http_status,final_url,checked_at) SELECT ?,?,?,?,?,?,COALESCE((SELECT status FROM external_link_cache WHERE url=? AND checked_at>unixepoch()-86400),?), (SELECT http_status FROM external_link_cache WHERE url=?),(SELECT final_url FROM external_link_cache WHERE url=?),(SELECT checked_at FROM external_link_cache WHERE url=?) WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND status='published' AND published_revision=?)",
      ).bind(
        crypto.randomUUID(),
        post.project_id,
        post.id,
        link.href,
        link.anchor,
        link.kind,
        cacheUrl(link.href),
        link.kind === "unsafe"
          ? "unsafe"
          : ["anchor", "email", "telephone"].includes(link.kind)
            ? "healthy"
            : "unchecked",
        cacheUrl(link.href),
        cacheUrl(link.href),
        cacheUrl(link.href),
        post.id,
        post.published_revision,
      ),
    );
  // D1 allows a bounded statement batch. Articles have at most 500 indexed links.
  // Preserve atomicity rather than chunking a partially replaced inventory.
  await env.MAIN_DB.batch(statements);
  await refreshInternalLinks(env, post.project_id);
}
/** Resolve known article routes with one indexed SQL update, without egress. */
export async function refreshInternalLinks(env: Bindings, projectId: string) {
  const project = await env.MAIN_DB.prepare(
    "SELECT settings FROM projects WHERE id=?",
  )
    .bind(projectId)
    .first<{ settings: string }>();
  const base = projectBlogUrl(project?.settings ?? null)?.replace(/\/+$/, "");
  if (!base) return;
  const prefix = base + "/",
    start = prefix.length + 1;
  const sql =
    "WITH candidates AS (SELECT l.id,CASE WHEN normalized_url=? OR EXISTS(SELECT 1 FROM posts p WHERE p.project_id=l.project_id AND p.status='published' AND p.slug=substr(l.normalized_url,?)) THEN 1 ELSE 0 END AS healthy FROM post_links l WHERE project_id=? AND kind='internal' AND (normalized_url=? OR (substr(normalized_url,1,?)=? AND instr(substr(normalized_url,?),'/')=0 AND instr(substr(normalized_url,?),'%')=0))) UPDATE post_links AS l SET status=CASE c.healthy WHEN 1 THEN 'healthy' ELSE 'broken' END,http_status=CASE c.healthy WHEN 1 THEN 200 ELSE 404 END,final_url=NULL,checked_at=unixepoch() FROM candidates c WHERE c.id=l.id AND (l.status!=CASE c.healthy WHEN 1 THEN 'healthy' ELSE 'broken' END OR l.checked_at IS NULL OR l.checked_at<unixepoch()-86400)";
  await env.MAIN_DB.prepare(sql)
    .bind(base, start, projectId, base, prefix.length, prefix, start, start)
    .run();
}
function cacheUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}
export async function startLinkScan(env: Bindings, projectId: string) {
  if (!env.LINK_SCANNER)
    throw new HTTPException(503, {
      message: "Link scanning is not configured",
    });
  const project = await env.MAIN_DB.prepare(
    "SELECT account_id FROM projects WHERE id=?",
  )
    .bind(projectId)
    .first<{ account_id: string }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const access = await accountAccess(env, project.account_id);
  requireWritable(access);
  const current = await env.MAIN_DB.prepare(
    "SELECT id FROM link_checks WHERE project_id=? AND status IN ('queued','running') LIMIT 1",
  )
    .bind(projectId)
    .first<{ id: string }>();
  if (current) return current.id;
  if ((await usage(env, access)).links >= PLANS[access.plan].linkChecks)
    throw new HTTPException(409, {
      message: "Monthly external link check allowance reached",
    });
  const id = crypto.randomUUID();
  await env.MAIN_DB.batch([
    env.MAIN_DB.prepare(
      "INSERT INTO link_checks(id,project_id,account_id) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM link_checks WHERE project_id=? AND status IN (\'queued\',\'running\'))",
    ).bind(id, projectId, project.account_id, projectId),
    env.MAIN_DB.prepare(
      "INSERT INTO background_jobs(id,kind,payload) SELECT ?,'link_scan',? WHERE EXISTS(SELECT 1 FROM link_checks WHERE id=?)",
    ).bind("links:" + id, JSON.stringify({ scanId: id }), id),
  ]);
  return (
    (
      await env.MAIN_DB.prepare(
        "SELECT id FROM link_checks WHERE project_id=? AND status IN (\'queued\',\'running\')",
      )
        .bind(projectId)
        .first<{ id: string }>()
    )?.id ?? id
  );
}
export async function processLinkScan(
  env: Bindings,
  scanId: string,
): Promise<boolean> {
  const scan = await env.MAIN_DB.prepare(
    "SELECT * FROM link_checks WHERE id=? AND status IN ('queued','running')",
  )
    .bind(scanId)
    .first<{ id: string; account_id: string; project_id: string }>();
  if (!scan) return false;
  const access = await accountAccess(env, scan.account_id);
  if (!access.writable) {
    await env.MAIN_DB.prepare(
      "UPDATE link_checks SET status='paused',error='Subscription expired',completed_at=unixepoch() WHERE id=?",
    )
      .bind(scanId)
      .run();
    return false;
  }
  if (!env.LINK_SCANNER) throw new Error("Link scanner binding missing");
  await env.MAIN_DB.prepare(
    "UPDATE link_checks SET status='running' WHERE id=?",
  )
    .bind(scanId)
    .run();
  const candidates = await env.MAIN_DB.prepare(
    // Leave room for authorization, reservations and job bookkeeping within Free D1's query limit.
    "SELECT DISTINCT url FROM post_links WHERE project_id=? AND kind IN ('internal','external') AND ignored=0 AND (checked_at IS NULL OR checked_at<unixepoch()-86400) LIMIT 4",
  )
    .bind(scan.project_id)
    .all<{ url: string }>();
  let attempted = 0;
  for (const { url } of candidates.results) {
    let result: LinkResult | undefined,
      checkedAt = Math.floor(Date.now() / 1000);
    const destination = cacheUrl(url);
    const cached = await env.MAIN_DB.prepare(
      "SELECT status,http_status AS httpStatus,final_url AS finalUrl,checked_at AS checkedAt FROM external_link_cache WHERE url=? AND checked_at>unixepoch()-86400",
    )
      .bind(destination)
      .first<LinkResult & { checkedAt: number }>();
    if (cached) {
      result = cached;
      checkedAt = cached.checkedAt;
    } else {
      const reservation = scanId + ":" + (await hash(destination));
      const previous = await env.MAIN_DB.prepare(
        "SELECT settled FROM usage_reservations WHERE id=?",
      )
        .bind(reservation)
        .first<{ settled: number }>();
      if (!previous) {
        try {
          await reserveUsage(env, access, reservation, "links", 1);
        } catch (error) {
          if (
            !String(error).includes("USAGE_LIMIT") &&
            !(error instanceof HTTPException && error.status === 402)
          )
            throw error;
          await env.MAIN_DB.prepare(
            "UPDATE link_checks SET status='partial',error='Monthly allowance reached',completed_at=unixepoch() WHERE id=?",
          )
            .bind(scanId)
            .run();
          return false;
        }
      }
      try {
        const response = await env.LINK_SCANNER.fetch("https://scanner/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: destination }),
        });
        if (!response.ok) throw new Error("Scanner unavailable");
        result = await response.json<LinkResult>();
      } catch {
        result = { status: "inconclusive", httpStatus: null, finalUrl: null };
      }
      await settleUsage(env, reservation, 1);
      await env.MAIN_DB.prepare(
        "INSERT INTO external_link_cache(url,status,http_status,final_url,checked_at) VALUES(?,?,?,?,unixepoch()) ON CONFLICT(url) DO UPDATE SET status=excluded.status,http_status=excluded.http_status,final_url=excluded.final_url,checked_at=excluded.checked_at",
      )
        .bind(destination, result.status, result.httpStatus, result.finalUrl)
        .run();
      attempted++;
    }
    await env.MAIN_DB.prepare(
      "UPDATE post_links SET status=?,http_status=?,final_url=?,checked_at=? WHERE project_id=? AND url=?",
    )
      .bind(
        result.status,
        result.httpStatus,
        result.finalUrl,
        checkedAt,
        scan.project_id,
        url,
      )
      .run();
  }
  await env.MAIN_DB.prepare(
    "UPDATE link_checks SET checked=checked+? WHERE id=?",
  )
    .bind(attempted, scanId)
    .run();
  if (candidates.results.length === 4) return true;
  await env.MAIN_DB.prepare(
    "UPDATE link_checks SET status='complete',completed_at=unixepoch() WHERE id=?",
  )
    .bind(scanId)
    .run();
  return false;
}
async function hash(text: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function linkReport(
  env: Bindings,
  projectId: string,
  options: {
    cursor?: string | undefined;
    status?: string | undefined;
    limit?: number | undefined;
  } = {},
) {
  await refreshInternalLinks(env, projectId);
  const limit = options.limit ?? 100,
    conditions = ["project_id=?"],
    values: unknown[] = [projectId];
  if (options.cursor) {
    conditions.push("id>?");
    values.push(options.cursor);
  }
  if (options.status) {
    conditions.push("status=?");
    values.push(options.status);
  }
  const [links, scans, project] = await Promise.all([
    env.MAIN_DB.prepare(
      "SELECT id,post_id AS postId,url,anchor,kind,status,http_status AS httpStatus,final_url AS finalUrl,checked_at AS checkedAt,ignored FROM post_links WHERE " +
        conditions.join(" AND ") +
        " ORDER BY id LIMIT ?",
    )
      .bind(...values, limit + 1)
      .all<{ id: string; url: string }>(),
    env.MAIN_DB.prepare(
      "SELECT id,status,checked,error,created_at AS createdAt,completed_at AS completedAt FROM link_checks WHERE project_id=? ORDER BY created_at DESC LIMIT 10",
    )
      .bind(projectId)
      .all(),
    env.MAIN_DB.prepare("SELECT settings FROM projects WHERE id=?")
      .bind(projectId)
      .first<{ settings: string }>(),
  ]);
  const base = projectBlogUrl(project?.settings ?? null)?.replace(/\/+$/, "");
  const orphaned = base
    ? (
        await env.MAIN_DB.prepare(
          "SELECT p.id,p.title,p.slug FROM posts p WHERE p.project_id=? AND p.status='published' AND NOT EXISTS(SELECT 1 FROM post_links l WHERE l.project_id=p.project_id AND l.kind='internal' AND l.post_id!=p.id AND l.normalized_url=?||'/'||p.slug)",
        )
          .bind(projectId, base)
          .all()
      ).results
    : [];
  const page = links.results.slice(0, limit);
  return {
    links: page.map((l) => ({ ...l, insecure: l.url.startsWith("http:") })),
    scans: scans.results,
    orphaned,
    nextCursor: links.results.length > limit ? page.at(-1)!.id : null,
    limited: links.results.length > limit,
  };
}
