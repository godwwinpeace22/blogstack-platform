import { PLANS } from "@blogstack/core";
import { enqueue, drainJobs } from "./jobs.js";
import { deleteMedia } from "./r2.js";
import { startLinkScan } from "./links.js";
import type { AccountAccess } from "./entitlements.js";
import type { Bindings } from "../types.js";
async function notice(
  env: Bindings,
  a: AccountAccess,
  kind: string,
  subject: string,
  text: string,
) {
  const id = "notice:" + a.account_id + ":" + kind + ":" + a.access_until;
  const owner = await env.MAIN_DB.prepare(
    "SELECT u.email FROM users u JOIN accounts a ON a.owner_id=u.id WHERE a.id=?",
  )
    .bind(a.account_id)
    .first<{ email: string }>();
  if (!owner) return;
  await env.MAIN_DB.batch([
    env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO background_jobs(id,kind,payload) SELECT ?,'email',? WHERE NOT EXISTS(SELECT 1 FROM lifecycle_notices WHERE account_id=? AND kind=? AND access_until=?)",
    ).bind(
      id,
      JSON.stringify({
        to: owner.email,
        subject,
        html:
          "<p>" +
          text +
          '</p><p><a href="' +
          env.FRONTEND_URL +
          '/settings">Manage your BlogStack account</a></p>',
      }),
      a.account_id,
      kind,
      a.access_until,
    ),
    env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO lifecycle_notices(account_id,kind,access_until) VALUES(?,?,?)",
    ).bind(a.account_id, kind, a.access_until),
  ]);
}
export async function runLifecycle(
  env: Bindings,
  now = Math.floor(Date.now() / 1000),
) {
  const accounts = await env.MAIN_DB.prepare(
    "SELECT * FROM account_access WHERE trial_started_at IS NOT NULL OR provider_customer_id IS NOT NULL OR pending_plan IS NOT NULL",
  ).all<AccountAccess>();
  for (const a of accounts.results) {
    if (a.internal_access) continue;
    if (a.access_until && !a.writable) {
      if (now >= a.access_until + 90 * 86400 && !a.purged_at) {
        const purged = await env.MAIN_DB.batch([
          env.MAIN_DB.prepare(
            "DELETE FROM projects WHERE account_id=? AND EXISTS(SELECT 1 FROM account_access WHERE account_id=? AND writable=0 AND access_until+7776000<=?)",
          ).bind(a.account_id, a.account_id, now),
          env.MAIN_DB.prepare(
            "DELETE FROM invitations WHERE account_id=? AND EXISTS(SELECT 1 FROM account_access WHERE account_id=? AND writable=0 AND access_until+7776000<=?)",
          ).bind(a.account_id, a.account_id, now),
          env.MAIN_DB.prepare(
            "DELETE FROM account_members WHERE account_id=? AND EXISTS(SELECT 1 FROM account_access WHERE account_id=? AND writable=0 AND access_until+7776000<=?)",
          ).bind(a.account_id, a.account_id, now),
          env.MAIN_DB.prepare(
            "UPDATE account_billing SET purged_at=? WHERE account_id=? AND MAX(COALESCE(paid_through,0),COALESCE(trial_ends_at,0))+7776000<=?",
          ).bind(now, a.account_id, now),
        ]);
        if (purged[3]?.meta.changes)
          await notice(
            env,
            a,
            "deleted",
            "Your BlogStack content has been deleted",
            "The 90-day retention period has ended. Your blog content and media have been scheduled for deletion.",
          );
      } else if (!a.purged_at) {
        await notice(
          env,
          a,
          "expired",
          "Your BlogStack publishing access has expired",
          "Editing and AI assistance are paused. Published content remains available for 30 days after expiry, and content exports remain available for 90 days.",
        );
        if (
          now >= a.access_until + 23 * 86400 &&
          now < a.access_until + 30 * 86400
        )
          await notice(
            env,
            a,
            "delivery_warning",
            "Your BlogStack delivery pauses in seven days or less",
            "Subscribe to keep BlogStack API and media delivery available. You can still export your content.",
          );
        if (now >= a.access_until + 30 * 86400)
          await notice(
            env,
            a,
            "delivery_paused",
            "Your BlogStack delivery is paused",
            "Your public content delivery is paused. Subscribe to resume, or export your content before the 90-day retention deadline.",
          );
        if (now >= a.access_until + 83 * 86400)
          await notice(
            env,
            a,
            "deletion_warning",
            "Export your BlogStack content before deletion",
            "Your content and media will be deleted at the end of the 90-day retention period, in seven days or less. Export now if you do not plan to subscribe.",
          );
      }
    } else if (
      a.writable &&
      !a.paid_through &&
      a.trial_ends_at &&
      now >= a.trial_ends_at - 2 * 86400
    ) {
      await notice(
        env,
        a,
        "trial_warning",
        "Your BlogStack trial ends soon",
        "Your trial ends in two days or less. Choose a plan to keep editing. There is no automatic charge.",
      );
    }
    if ((a.provider_customer_id || a.pending_plan) && env.POLAR_ACCESS_TOKEN)
      await enqueue(
        env,
        "reconcile",
        { accountId: a.account_id },
        "reconcile:" + a.account_id + ":" + Math.floor(now / 21600),
      );
  }
  await env.MAIN_DB.prepare(
    "DELETE FROM media WHERE confirmed=0 AND COALESCE(reservation_expires_at,created_at+900)<?",
  )
    .bind(now)
    .run();
  const tombstones = await env.MAIN_DB.prepare(
    "SELECT key,media_id FROM r2_deletions WHERE created_at<=? ORDER BY created_at LIMIT 4",
  )
    .bind(now - Math.max(0, Number(env.MEDIA_DELETE_GRACE_SECONDS) || 0))
    .all<{ key: string; media_id: string }>();
  for (const item of tombstones.results) {
    try {
      await deleteMedia(env, item.key, item.media_id, true);
      await env.MAIN_DB.prepare("DELETE FROM r2_deletions WHERE key=?")
        .bind(item.key)
        .run();
    } catch {
      console.error("Media cleanup needs retry", { mediaId: item.media_id });
    }
  }
  const stale = await env.MAIN_DB.prepare(
    "SELECT r.id FROM usage_reservations r LEFT JOIN agent_runs a ON a.id=r.id WHERE r.metric='ai' AND r.settled=0 AND r.created_at<? AND (a.id IS NULL OR a.status IN ('queued','running','failed'))",
  )
    .bind(now - 900)
    .all<{ id: string }>();
  for (const r of stale.results)
    await env.MAIN_DB.batch([
      env.MAIN_DB.prepare(
        "UPDATE agent_runs SET status='failed',error='This request expired. No credits were charged.',completed_at=? WHERE id=? AND status IN ('queued','running')",
      ).bind(now, r.id),
      env.MAIN_DB.prepare(
        "UPDATE usage_reservations SET reserved=0,settled=1 WHERE id=? AND settled=0",
      ).bind(r.id),
    ]);
  const projects = await env.MAIN_DB.prepare(
    "SELECT p.id,p.account_id,a.plan,a.writable,a.public_delivery FROM projects p JOIN account_access a ON a.account_id=p.account_id",
  ).all<{
    id: string;
    account_id: string;
    plan: keyof typeof PLANS;
    writable: number;
    public_delivery: number;
  }>();
  for (const p of projects.results) {
    const cadence = PLANS[p.plan].auditDays;
    if (p.writable && cadence && env.LINK_SCANNER) {
      const last = await env.MAIN_DB.prepare(
        "SELECT MAX(created_at) AS latest FROM link_checks WHERE project_id=?",
      )
        .bind(p.id)
        .first<{ latest: number | null }>();
      if (!last?.latest || last.latest + cadence * 86400 <= now)
        try {
          await startLinkScan(env, p.id);
        } catch {
          /* shared quota or an existing scan */
        }
    }
    if (p.public_delivery && env.ANALYTICS && env.CF_ANALYTICS_TOKEN) {
      for (const offset of [1, 2]) {
        const day = new Date((now - offset * 86400) * 1000)
          .toISOString()
          .slice(0, 10);
        await enqueue(
          env,
          "analytics",
          { projectId: p.id, day },
          "analytics:" + p.id + ":" + day + ":" + Math.floor(now / 21600),
        );
      }
    }
    await env.MAIN_DB.prepare(
      "DELETE FROM analytics_daily WHERE project_id=? AND day<?",
    )
      .bind(
        p.id,
        new Date((now - PLANS[p.plan].analyticsDays * 86400) * 1000)
          .toISOString()
          .slice(0, 10),
      )
      .run();
  }
  await env.MAIN_DB.prepare(
    "DELETE FROM external_link_cache WHERE checked_at<?",
  )
    .bind(now - 30 * 86400)
    .run();
  await env.MAIN_DB.prepare(
    "DELETE FROM background_jobs WHERE status='complete' AND created_at<?",
  )
    .bind(now - 7 * 86400)
    .run();
  await drainJobs(env);
}
