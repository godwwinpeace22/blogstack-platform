import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { PLANS } from "@blogstack/core";
import { requireAuth } from "../middleware/auth.js";
import { accountAccess, accountUsage, limitsFor } from "../lib/entitlements.js";
import {
  checkout,
  changePlan,
  portal,
  receivePayment,
  reconcileAccount,
  billingReady,
} from "../lib/polar.js";
import { notifyJob } from "../lib/jobs.js";
import type { HonoEnv } from "../types.js";
const app = new Hono<HonoEnv>();
const selfHostedBillingGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.method !== "GET") {
    const selfHosted =
      c.env.DEPLOYMENT_MODE === "self_hosted" ||
      (
        await c.env.MAIN_DB.prepare(
          "SELECT mode FROM deployment_settings WHERE id=1",
        ).first<{ mode: string }>()
      )?.mode === "self_hosted";
    if (selfHosted)
      throw new HTTPException(409, {
        message: "Self-hosted workspaces do not use BlogStack subscriptions",
      });
  }
  return next();
};
app.use("/billing/webhooks/polar", selfHostedBillingGuard);
app.use("/accounts/:accountId/billing", selfHostedBillingGuard);
app.use("/accounts/:accountId/billing/*", selfHostedBillingGuard);
app.post("/billing/webhooks/polar", async (c) => {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const id = await receivePayment(c.env, await c.req.text(), headers);
  c.executionCtx.waitUntil(notifyJob(c.env, "payment:" + id));
  return c.json({ received: true });
});
app.use("/accounts/:accountId/billing/*", requireAuth, async (c, next) => {
  if (c.var.apiKey)
    throw new HTTPException(403, {
      message: "Billing requires an owner session",
    });
  const owner = await c.env.MAIN_DB.prepare(
    "SELECT id FROM accounts WHERE id=? AND owner_id=?",
  )
    .bind(c.req.param("accountId"), c.var.userId)
    .first();
  if (!owner)
    throw new HTTPException(403, {
      message: "Only the account owner can manage billing",
    });
  await next();
});
app.use("/accounts/:accountId/billing", requireAuth, async (c, next) => {
  if (
    c.var.apiKey ||
    !(await c.env.MAIN_DB.prepare(
      "SELECT id FROM accounts WHERE id=? AND owner_id=?",
    )
      .bind(c.req.param("accountId"), c.var.userId)
      .first())
  )
    throw new HTTPException(403, {
      message: "Only the account owner can manage billing",
    });
  await next();
});
app.get("/accounts/:accountId/billing", async (c) => {
  const a = await accountAccess(c.env, c.req.param("accountId"));
  return c.json({
    accountId: a.account_id,
    plan: a.plan,
    interval: a.interval,
    internalAccess: !!a.internal_access,
    selfHosted: !!a.self_hosted,
    status: a.self_hosted
      ? "self_hosted"
      : a.internal_access
        ? "internal"
        : a.writable
          ? a.paid_through && a.paid_through > Math.floor(Date.now() / 1000)
            ? "active"
            : "trialing"
          : a.trial_started_at
            ? "expired"
            : "not_started",
    hasBillingCustomer: !!a.provider_customer_id,
    hasSubscription:
      !!a.provider_subscription_id &&
      !["canceled", "incomplete_expired"].includes(a.provider_status ?? ""),
    providerStatus: a.provider_status,
    canWrite: !!a.writable,
    trialEndsAt: a.internal_access || a.self_hosted ? null : a.trial_ends_at,
    paidThrough: a.paid_through,
    deliveryEndsAt: a.access_until ? a.access_until + 30 * 86400 : null,
    deletesAt: a.access_until ? a.access_until + 90 * 86400 : null,
    cancelAtPeriodEnd: !!a.cancel_at_period_end,
    pendingPlan: a.pending_plan,
    pendingInterval: a.pending_interval,
    limits: limitsFor(a),
    usage: await accountUsage(c.env, a),
    catalog: PLANS,
    configured: !a.internal_access && !a.self_hosted && billingReady(c.env),
  });
});
const selection = z.object({
  plan: z.enum(["solo", "studio", "growth"]),
  interval: z.enum(["month", "year"]),
});
app.post(
  "/accounts/:accountId/billing/checkout",
  zValidator("json", selection),
  async (c) => {
    const data = c.req.valid("json");
    return c.json({
      url: await checkout(
        c.env,
        c.req.param("accountId"),
        data.plan,
        data.interval,
      ),
    });
  },
);
app.post(
  "/accounts/:accountId/billing/change",
  zValidator("json", selection),
  async (c) => {
    const data = c.req.valid("json");
    return c.json(
      await changePlan(
        c.env,
        c.req.param("accountId"),
        data.plan,
        data.interval,
      ),
    );
  },
);
app.post("/accounts/:accountId/billing/portal", async (c) =>
  c.json({ url: await portal(c.env, c.req.param("accountId")) }),
);
app.post("/accounts/:accountId/billing/sync", async (c) => {
  await reconcileAccount(c.env, c.req.param("accountId"));
  return c.json({ synced: true });
});
export default app;
