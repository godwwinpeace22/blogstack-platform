import { HTTPException } from "hono/http-exception";
import { PLANS, isPlan, type Plan } from "@blogstack/core";
import type { Bindings, HonoEnv } from "../types.js";
import type { Context } from "hono";

export interface AccountAccess {
  account_id: string;
  plan: Plan;
  interval: "month" | "year" | null;
  trial_started_at: number | null;
  trial_ends_at: number | null;
  paid_through: number | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_status: string | null;
  cancel_at_period_end: number;
  period_anchor: number | null;
  pending_plan: string | null;
  pending_interval: string | null;
  purged_at: number | null;
  internal_access: number;
  max_blogs: number | null;
  max_people: number;
  storage_bytes: number;
  access_until: number;
  writable: number;
  public_delivery: number;
}
export async function accountAccess(
  env: Pick<Bindings, "MAIN_DB">,
  accountId: string,
): Promise<AccountAccess> {
  const row = await env.MAIN_DB.prepare(
    "SELECT * FROM account_access WHERE account_id=?",
  )
    .bind(accountId)
    .first<AccountAccess>();
  if (!row || !isPlan(row.plan))
    throw new HTTPException(404, { message: "Account not found" });
  return row;
}
export function requireWritable(access: AccountAccess): void {
  if (!access.writable)
    throw new HTTPException(402, {
      message:
        "Your trial or subscription has expired. Subscribe to continue publishing.",
    });
}
export function usagePeriod(
  access: AccountAccess,
  now = Math.floor(Date.now() / 1000),
): number {
  const start = access.period_anchor ?? access.trial_started_at ?? now;
  if (!access.paid_through) return access.trial_started_at ?? start;
  const anchor = new Date(start * 1000);
  const month = new Date(now * 1000);
  const dateFor = (offset: number) => {
    const year = month.getUTCFullYear(),
      index = month.getUTCMonth() + offset;
    const lastDay = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    return Math.floor(
      Date.UTC(
        year,
        index,
        Math.min(anchor.getUTCDate(), lastDay),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
      ) / 1000,
    );
  };
  return Math.max(start, dateFor(0) > now ? dateFor(-1) : dateFor(0));
}
export async function usage(
  env: Pick<Bindings, "MAIN_DB">,
  access: AccountAccess,
) {
  const rows = await env.MAIN_DB.prepare(
    "SELECT metric,used FROM usage_counters WHERE account_id=? AND period_start=?",
  )
    .bind(access.account_id, usagePeriod(access))
    .all<{ metric: string; used: number }>();
  return {
    ai: rows.results.find((r) => r.metric === "ai")?.used ?? 0,
    links: rows.results.find((r) => r.metric === "links")?.used ?? 0,
  };
}
export async function reserveUsage(
  env: Pick<Bindings, "MAIN_DB">,
  access: AccountAccess,
  id: string,
  metric: "ai" | "links",
  amount: number,
) {
  requireWritable(access);
  await env.MAIN_DB.prepare(
    "INSERT INTO usage_reservations(id,account_id,period_start,metric,reserved) VALUES(?,?,?,?,?)",
  )
    .bind(id, access.account_id, usagePeriod(access), metric, amount)
    .run();
}
export async function settleUsage(
  env: Pick<Bindings, "MAIN_DB">,
  id: string,
  actual: number,
) {
  await env.MAIN_DB.prepare(
    "UPDATE usage_reservations SET reserved=?,settled=1 WHERE id=? AND settled=0 AND ?>=0 AND ?<=reserved",
  )
    .bind(actual, id, actual, actual)
    .run();
}
export async function enforceWriteAccess(c: Context<HonoEnv>): Promise<void> {
  const path = c.req.path;
  if (c.req.param("projectId") && ["GET", "HEAD"].includes(c.req.method)) {
    const current = await accountAccess(c.env, c.var.accountId);
    if (
      current.purged_at ||
      (current.access_until > 0 &&
        current.access_until + 90 * 86400 <= Math.floor(Date.now() / 1000))
    )
      throw new HTTPException(410, {
        message: "The content retention period has ended",
      });
  }
  if (
    ["GET", "HEAD", "OPTIONS", "DELETE"].includes(c.req.method) ||
    path.includes("/billing") ||
    /^\/invitations\/[^/]+\/accept$/.test(path) ||
    path.endsWith("/unpublish") ||
    path.endsWith("/export")
  )
    return;
  const access = await accountAccess(c.env, c.var.accountId);
  if (
    c.req.method === "POST" &&
    path === "/projects" &&
    access.trial_started_at === null &&
    !access.purged_at
  )
    return;
  requireWritable(access);
}
export async function requirePublicDelivery(
  env: Pick<Bindings, "MAIN_DB">,
  accountId: string,
) {
  if (!(await accountAccess(env, accountId)).public_delivery)
    throw new HTTPException(410, {
      message: "This blog is paused. Contact its owner.",
    });
}
export async function accountUsage(
  env: Pick<Bindings, "MAIN_DB">,
  access: AccountAccess,
) {
  const [people, blogs, media] = await env.MAIN_DB.batch<{ total: number }>([
    env.MAIN_DB.prepare(
      "SELECT COUNT(*) AS total FROM account_people WHERE account_id=?",
    ).bind(access.account_id),
    env.MAIN_DB.prepare(
      "SELECT COUNT(*) AS total FROM projects WHERE account_id=?",
    ).bind(access.account_id),
    env.MAIN_DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN m.confirmed=1 THEN COALESCE(m.size,0) ELSE m.reserved_size END),0) AS total FROM media m JOIN projects p ON p.id=m.project_id WHERE p.account_id=? AND (m.confirmed=1 OR m.reservation_expires_at>unixepoch())",
    ).bind(access.account_id),
  ]);
  return {
    people: people!.results[0]?.total ?? 0,
    blogs: blogs!.results[0]?.total ?? 0,
    storageBytes: media!.results[0]?.total ?? 0,
    ...(await usage(env, access)),
  };
}
export function limitsFor(access: AccountAccess) {
  return {
    ...PLANS[access.plan],
    maxProjects: access.max_blogs,
    maxAccountMembers: access.max_people,
    storageBytes: access.storage_bytes,
  };
}
