/** Isolated acceptance harness. Never configured as the production entry point. */
import production from "../src/index.js";
import { processJob } from "../src/lib/jobs.js";
import type { Bindings } from "../src/types.js";
type Env = Bindings & { QA_CONTROL_SECRET: string };
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (
      new URL(env.API_URL).hostname.startsWith("blogstack-qa-app.") &&
      /\/public\/[^/]+\/events$/.test(new URL(request.url).pathname) &&
      env.QA_CONTROL_SECRET &&
      request.headers.get("x-qa-control") === env.QA_CONTROL_SECRET
    ) {
      let written = false;
      const result = await production.fetch(
        request,
        {
          ...env,
          ANALYTICS: {
            writeDataPoint(point) {
              written = true;
              env.ANALYTICS!.writeDataPoint(point);
            },
          },
        },
        ctx,
      );
      const response = new Response(result.body, result);
      response.headers.set("x-qa-event-written", String(written));
      return response;
    }
    if (new URL(request.url).pathname === "/__qa/run-job") {
      if (
        !new URL(env.API_URL).hostname.startsWith("blogstack-qa-app.") ||
        request.method !== "POST" ||
        !env.QA_CONTROL_SECRET ||
        request.headers.get("x-qa-control") !== env.QA_CONTROL_SECRET
      )
        return new Response("Not found", { status: 404 });
      const input = await request.json<{ id?: string }>();
      if (!input.id || input.id.length > 200)
        return new Response("Invalid job", { status: 400 });
      const job = await env.MAIN_DB.prepare(
        "SELECT kind FROM background_jobs WHERE id=?",
      )
        .bind(input.id)
        .first<{ kind: string }>();
      // No payment, reconciliation or outbound email job can be dispatched.
      if (
        !job ||
        !["index_post", "link_scan", "agent", "analytics"].includes(job.kind)
      )
        return new Response("Job is outside this test", { status: 409 });
      await processJob(env, input.id);
      const status = await env.MAIN_DB.prepare(
        "SELECT status FROM background_jobs WHERE id=?",
      )
        .bind(input.id)
        .first();
      return Response.json(status, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return production.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
