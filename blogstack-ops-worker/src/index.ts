import { startBackup, processBackup, maintainBackups } from "./backups.js";
import { monitor, testAlert } from "./monitor.js";
import { epoch, stateGet, statePut, type Env, type Job } from "./types.js";

export async function tick(env: Env, now = epoch()) {
  if (env.OPS_ENABLED !== "true") return;
  await statePut(env, "schedule.latest", { at: now });
  await env.JOBS.send({ kind: "monitor" });
  await env.JOBS.send({ kind: "maintain" });
  const local = new Date((now + 3600) * 1000);
  if (local.getUTCHours() >= 3) await startBackup(env, false, now);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/status" && request.method === "GET") {
      const runs = await env.STATE.prepare(
        "SELECT id,kind,status,created_at,completed_at,updated_at,error_code FROM backup_runs ORDER BY created_at DESC LIMIT 12",
      ).all();
      return Response.json({
        enabled: env.OPS_ENABLED === "true",
        schedule: await stateGet(env, "schedule.latest"),
        health: await stateGet(env, "health.latest"),
        alert: await stateGet(env, "health.alert"),
        deliveryTests: {
          incident: await stateGet(env, "alert.delivery.incident"),
          recovery: await stateGet(env, "alert.delivery.recovery"),
        },
        runs: runs.results,
      });
    }
    if (env.OPS_ENABLED !== "true")
      return Response.json(
        { error: "Operations are not enabled" },
        { status: 503 },
      );
    if (request.method === "POST" && path === "/backup")
      return Response.json(await startBackup(env, true), { status: 202 });
    if (request.method === "POST" && path === "/monitor")
      return Response.json({ issues: await monitor(env) });
    if (request.method === "POST" && path === "/test-alert") {
      const body = await request.json<{ phase?: unknown; testId?: unknown }>();
      if (
        !["incident", "recovery"].includes(String(body.phase)) ||
        typeof body.testId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body.testId)
      )
        return Response.json(
          { error: "Invalid delivery test" },
          { status: 400 },
        );
      return Response.json(
        await testAlert(
          env,
          body.phase as "incident" | "recovery",
          body.testId,
        ),
      );
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(tick(env));
  },
  async queue(batch: MessageBatch<Job>, env: Env) {
    for (const message of batch.messages) {
      try {
        if (env.OPS_ENABLED !== "true") {
          message.ack();
          continue;
        }
        if (message.body.kind === "backup")
          await processBackup(env, message.body.id);
        else if (message.body.kind === "monitor") await monitor(env);
        else await maintainBackups(env);
        message.ack();
      } catch (error) {
        console.error("Operations task failed", {
          kind: message.body.kind,
          code:
            error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
              ? error.message
              : "OPERATIONS_FAILED",
        });
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env, Job>;
