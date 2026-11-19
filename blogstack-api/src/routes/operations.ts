import { Hono } from "hono";
import { initAuth } from "../lib/auth.js";
import type { HonoEnv } from "../types.js";
const app = new Hono<HonoEnv>();
app.use("/internal/operations/*", async (c, next) => {
  if (c.req.header("x-api-key") || !c.env.OPERATOR_EMAIL)
    return c.json({ error: "Forbidden" }, 403);
  // Operations remain available to the verified operator after a trial expires.
  // Customer account entitlements must never disable backups or incident response.
  const session = await initAuth(
    c.env,
    c.env.API_URL + "/api/auth",
  ).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user.id) return c.json({ error: "Unauthorized" }, 401);
  const user = await c.env.MAIN_DB.prepare(
    "SELECT email,email_verified FROM users WHERE id=?",
  )
    .bind(session.user.id)
    .first<{ email: string; email_verified: number }>();
  if (
    !user?.email_verified ||
    user.email.toLowerCase() !== c.env.OPERATOR_EMAIL.toLowerCase()
  )
    return c.json({ error: "Forbidden" }, 403);
  return next();
});
app.all("/internal/operations/:action", async (c) => {
  const action = c.req.param("action");
  if (
    !["status", "backup", "monitor", "test-alert"].includes(action) ||
    !c.env.OPERATIONS
  )
    return c.json({ error: "Not found" }, 404);
  if (
    (action === "status" && c.req.method !== "GET") ||
    (action !== "status" && c.req.method !== "POST")
  )
    return c.json({ error: "Method not allowed" }, 405);
  const body = c.req.method === "POST" ? await c.req.text() : undefined;
  const response = await c.env.OPERATIONS.fetch(
    "https://operations/" + action,
    {
      method: c.req.method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body }),
    },
  );
  c.header("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
export default app;
