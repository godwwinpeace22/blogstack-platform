import type { Bindings } from "../types.js";
export interface Job {
  id: string;
  kind: string;
  payload: string;
  attempts: number;
}
export async function enqueue(
  env: Bindings,
  kind: string,
  payload: unknown,
  id: string = crypto.randomUUID(),
) {
  await env.MAIN_DB.prepare(
    "INSERT OR IGNORE INTO background_jobs(id,kind,payload) VALUES(?,?,?)",
  )
    .bind(id, kind, JSON.stringify(payload))
    .run();
  return id;
}
export async function notifyJob(env: Bindings, id: string, delaySeconds = 0) {
  if (env.JOB_QUEUE)
    try {
      await env.JOB_QUEUE.send({ jobId: id }, { delaySeconds });
    } catch {
      console.warn("Queue notification failed; durable outbox will retry", id);
    }
}
export async function processJob(env: Bindings, id: string): Promise<void> {
  const claimed = await env.MAIN_DB.prepare(
    "UPDATE background_jobs SET status='running',attempts=attempts+1,lease_until=unixepoch()+300 WHERE id=? AND available_at<=unixepoch() AND (status='pending' OR (status='running' AND lease_until<unixepoch()))",
  )
    .bind(id)
    .run();
  if (!claimed.meta.changes) return;
  const job = await env.MAIN_DB.prepare(
    "SELECT id,kind,payload,attempts FROM background_jobs WHERE id=?",
  )
    .bind(id)
    .first<Job>();
  if (!job) return;
  try {
    const payload = JSON.parse(job.payload);
    if (job.kind === "index_post") {
      const { indexPostLinks } = await import("./links.js");
      const post = await env.MAIN_DB.prepare(
        "SELECT * FROM posts WHERE id=? AND status='published'",
      )
        .bind(payload.postId)
        .first<import("../types.js").DbPost>();
      if (post) await indexPostLinks(env, post);
    } else if (job.kind === "link_scan") {
      const { processLinkScan } = await import("./links.js");
      const more = await processLinkScan(env, payload.scanId);
      if (more) {
        await env.MAIN_DB.prepare(
          "UPDATE background_jobs SET status='pending',available_at=unixepoch()+1,lease_until=NULL,attempts=0 WHERE id=?",
        )
          .bind(id)
          .run();
        await notifyJob(env, id, 1);
        return;
      }
    } else if (job.kind === "agent") {
      const { executeAgent } = await import("./agents.js");
      await executeAgent(env, payload.runId);
    } else if (job.kind === "reconcile") {
      const { reconcileAccount } = await import("./polar.js");
      await reconcileAccount(env, payload.accountId);
    } else if (job.kind === "payment") {
      const { processPaymentEvent } = await import("./polar.js");
      await processPaymentEvent(env, payload.eventId);
    } else if (job.kind === "analytics") {
      const { persistSnapshot } = await import("./analytics.js");
      if (
        await env.MAIN_DB.prepare("SELECT id FROM projects WHERE id=?")
          .bind(payload.projectId)
          .first()
      )
        await persistSnapshot(env, payload.projectId, payload.day);
    } else if (job.kind === "email") {
      const { sendEmail } = await import("./email.js");
      if (!env.RESEND_API_KEY)
        throw new Error("Transactional email is not configured");
      await sendEmail(env.RESEND_API_KEY, {
        ...payload,
        from: env.EMAIL_FROM,
        idempotencyKey: job.id,
      });
    } else throw new Error("Unknown background job");
    await env.MAIN_DB.prepare(
      "UPDATE background_jobs SET status='complete',lease_until=NULL,last_error=NULL WHERE id=?",
    )
      .bind(id)
      .run();
  } catch (error) {
    const terminal = job.kind === "agent" || job.attempts >= 5;
    await env.MAIN_DB.prepare(
      "UPDATE background_jobs SET status=?,lease_until=NULL,available_at=unixepoch()+?,last_error=? WHERE id=?",
    )
      .bind(
        terminal ? "failed" : "pending",
        Math.min(3600, 30 * 2 ** job.attempts),
        "Job failed; inspect correlated worker error",
        id,
      )
      .run();
    if (terminal && job.kind === "link_scan") {
      await env.MAIN_DB.prepare(
        "UPDATE link_checks SET status='failed',error='Link checking failed. Try another scan.',completed_at=unixepoch() WHERE id=? AND status IN ('queued','running')",
      )
        .bind(JSON.parse(job.payload).scanId)
        .run();
    }
    if (terminal && job.kind === "agent") {
      const runId = JSON.parse(job.payload).runId;
      await env.MAIN_DB.batch([
        env.MAIN_DB.prepare(
          "UPDATE agent_runs SET status='failed',error='AI could not complete this request. No credits were charged.',completed_at=unixepoch() WHERE id=? AND status IN ('queued','running')",
        ).bind(runId),
        env.MAIN_DB.prepare(
          "UPDATE usage_reservations SET reserved=0,settled=1 WHERE id=? AND settled=0",
        ).bind(runId),
      ]);
    }
    console.error("Background job failed", {
      jobId: id,
      kind: job.kind,
      attempt: job.attempts,
      error: error instanceof Error ? error.name : "Unknown",
    });
    if (!terminal) throw error;
  }
}
export async function drainJobs(env: Bindings) {
  const jobs = await env.MAIN_DB.prepare(
    "SELECT id FROM background_jobs WHERE available_at<=unixepoch() AND (status='pending' OR (status='running' AND lease_until<unixepoch())) ORDER BY created_at LIMIT 20",
  ).all<{ id: string }>();
  await Promise.allSettled(jobs.results.map((j) => notifyJob(env, j.id)));
  // Match the one-job queue consumer and bound fallback network/DB work.
  // Each external scan chunk performs multiple individual queries.
  const first = jobs.results[0];
  if (first) await processJob(env, first.id).catch(() => {});
}
