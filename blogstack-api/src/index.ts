import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "./middleware/cors.js";
import { errorHandler, requestId } from "./middleware/error.js";
import { rateLimitKey } from "./lib/rate-limit.js";
import { initAuth } from "./lib/auth.js";
import { runLifecycle } from "./lib/lifecycle.js";
import { drainJobs, processJob } from "./lib/jobs.js";
import { requireAuth } from "./middleware/auth.js";
import { dashboardResponse } from "./lib/dashboard.js";
import accounts from "./routes/accounts.js";
import projects from "./routes/projects.js";
import posts from "./routes/posts.js";
import media from "./routes/media.js";
import tags from "./routes/tags.js";
import apiKeys from "./routes/api-keys.js";
import members from "./routes/members.js";
import publicRoutes from "./routes/public.js";
import features from "./routes/features.js";
import billing from "./routes/billing.js";
import operations from "./routes/operations.js";
import type { HonoEnv } from "./types.js";

export const app = new Hono<HonoEnv>();
app.use("*", requestId);
app.onError(errorHandler);
app.use("*", cors());
app.use("*", secureHeaders());
app.use(
  "*",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, 413),
  }),
);
app.use("*", async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    c.req.header("cookie") &&
    !c.req.header("x-api-key") &&
    !c.req.path.startsWith("/public/")
  ) {
    const origin = c.req.header("origin");
    if (!origin || ![c.env.FRONTEND_URL, c.env.API_URL].includes(origin))
      return c.json({ error: "Invalid origin", code: "FORBIDDEN" }, 403);
  }
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path === "/api/resend-verification"
  ) {
    if (
      c.env.AUTH_RATE_LIMIT &&
      !(
        await c.env.AUTH_RATE_LIMIT.limit({
          key: await rateLimitKey(
            c.env.BETTER_AUTH_SECRET,
            "auth",
            c.req.header("cf-connecting-ip") || "local",
          ),
        })
      ).success
    )
      return c.json(
        { error: "Too many attempts. Try again shortly.", code: "RATE_LIMIT" },
        429,
      );
  }
  if (c.req.method === "POST" && c.req.path === "/api/auth/sign-up/email") {
    const local = ["localhost", "127.0.0.1"].includes(
      new URL(c.env.API_URL).hostname,
    );
    const mode = c.env.SIGNUP_MODE ?? (local ? "open" : "pilot");
    if (mode !== "open") {
      let email = "";
      try {
        const body = (await c.req.raw.clone().json()) as { email?: unknown };
        if (typeof body.email === "string")
          email = body.email.trim().toLowerCase();
      } catch {
        return c.json(
          { error: "Invalid signup request", code: "VALIDATION_ERROR" },
          400,
        );
      }
      const pilots = (c.env.PILOT_EMAILS ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase());
      const invited =
        mode === "pilot" &&
        (await c.env.MAIN_DB.prepare(
          "SELECT id FROM invitations WHERE lower(email)=? AND accepted_at IS NULL AND expires_at>unixepoch() LIMIT 1",
        )
          .bind(email)
          .first());
      if (mode === "closed" || (!pilots.includes(email) && !invited))
        return c.json(
          {
            error: "Signups are currently limited to invited pilot accounts.",
            message: "Signups are currently limited to invited pilot accounts.",
            code: "SIGNUP_RESTRICTED",
          },
          403,
        );
    }
  }
  return next();
});
app.get("/health", (c) => c.json({ ok: true }));
app.all("/api/auth/*", (c) =>
  initAuth(c.env, c.env.API_URL + "/api/auth").handler(c.req.raw),
);
app.post("/api/resend-verification", async (c) => {
  const input = await c.req.json<{ email: string; callbackURL?: string }>();
  if (typeof input.email !== "string" || input.email.length > 320)
    return c.json({ error: "A valid email is required" }, 400);
  const callback = new URL(
    input.callbackURL || "/projects",
    c.env.FRONTEND_URL,
  );
  if (callback.origin !== new URL(c.env.FRONTEND_URL).origin)
    return c.json({ error: "Invalid callback" }, 400);
  const result = await initAuth(
    c.env,
    c.env.API_URL + "/api/auth",
  ).api.sendVerificationEmail({
    body: { email: input.email, callbackURL: callback.href },
  });
  return c.json(result);
});
app.route("/accounts", accounts);
app.route("/projects", projects);
app.route("/projects", posts);
app.route("/projects", media);
app.route("/projects", tags);
app.route("/projects", apiKeys);
app.route("/", members);
app.route("/public", publicRoutes);
app.route("/projects", features);
app.route("/", billing);
app.route("/", operations);
app.all("/projects/:projectId/webhooks/*", requireAuth, (c) =>
  c.json(
    {
      error: "Customer webhooks are not available in this release",
      code: "FEATURE_UNAVAILABLE",
    },
    409,
  ),
);
app.all("/projects/:projectId/webhooks", requireAuth, (c) =>
  c.json(
    {
      error: "Customer webhooks are not available in this release",
      code: "FEATURE_UNAVAILABLE",
    },
    409,
  ),
);
app.get("/draft/:postId/ws", requireAuth, (c) =>
  c.json(
    {
      error: "Live collaboration is not available in this release",
      code: "FEATURE_UNAVAILABLE",
    },
    409,
  ),
);
app.notFound((c) => c.json({ error: "Not found", code: "NOT_FOUND" }, 404));
export { EditorDraft } from "./durable-objects/editor-draft.js";
export default {
  async fetch(request, env, ctx) {
    const dashboard = await dashboardResponse(request, env.DASHBOARD_ASSETS);
    return dashboard ?? app.fetch(request, env, ctx);
  },
  async scheduled(
    controller: ScheduledController,
    env: HonoEnv["Bindings"],
    ctx: ExecutionContext,
  ) {
    if (controller.cron === "0 * * * *") ctx.waitUntil(runLifecycle(env));
    else ctx.waitUntil(drainJobs(env));
  },
  async queue(
    batch: MessageBatch<{ jobId: string }>,
    env: HonoEnv["Bindings"],
  ) {
    for (const message of batch.messages)
      try {
        await processJob(env, message.body.jobId);
        message.ack();
      } catch {
        message.retry();
      }
  },
} satisfies ExportedHandler<HonoEnv["Bindings"], { jobId: string }>;
