import {
  createPolar,
  webhooks,
  type models,
  type Polar,
} from "@polar-sh/sdk/2026-10";
import { PLANS, type Plan, type BillingInterval } from "@blogstack/core";
import { HTTPException } from "hono/http-exception";
import { accountAccess, accountUsage } from "./entitlements.js";
import type { Bindings } from "../types.js";

export function billingReady(env: Bindings): boolean {
  if (env.DEPLOYMENT_MODE === "self_hosted") return false;
  const products = Object.keys(PLANS).flatMap((plan) =>
    ["MONTH", "YEAR"].map(
      (interval) =>
        env[
          ("POLAR_PRODUCT_" +
            plan.toUpperCase() +
            "_" +
            interval) as keyof Bindings
        ],
    ),
  );
  return (
    env.CHECKOUT_ENABLED === "true" &&
    !!env.POLAR_ACCESS_TOKEN &&
    !!env.POLAR_WEBHOOK_SECRET &&
    products.every(Boolean) &&
    new Set(products).size === 6 &&
    !!env.RESEND_API_KEY &&
    !!env.AI &&
    !!env.LINK_SCANNER &&
    !!env.ANALYTICS &&
    /^[a-f0-9]{32}$/.test(env.CF_ACCOUNT_ID ?? "") &&
    !!env.CF_ANALYTICS_TOKEN
  );
}
function requireBillingReady(env: Bindings) {
  if (env.POLAR_SERVER === "production" && !billingReady(env))
    throw new HTTPException(503, {
      message: "Paid subscriptions are not available yet",
    });
}
export function polar(env: Bindings): Polar {
  if (env.DEPLOYMENT_MODE === "self_hosted")
    throw new HTTPException(409, { message: "Self-hosted workspaces do not use BlogStack subscriptions" });
  if (!env.POLAR_ACCESS_TOKEN)
    throw new HTTPException(503, { message: "Billing is not available yet" });
  return createPolar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    environment: env.POLAR_SERVER ?? "sandbox",
    timeout: 20000,
  });
}
export function productId(
  env: Bindings,
  plan: Plan,
  interval: BillingInterval,
): string {
  const id =
    env[
      ("POLAR_PRODUCT_" +
        plan.toUpperCase() +
        "_" +
        interval.toUpperCase()) as keyof Bindings
    ];
  if (typeof id !== "string" || !id)
    throw new HTTPException(503, {
      message: "This billing option is not available yet",
    });
  return id;
}
export function identifyProduct(
  env: Bindings,
  id: string | null,
): { plan: Plan; interval: BillingInterval } | null {
  for (const plan of Object.keys(PLANS) as Plan[])
    for (const interval of ["month", "year"] as const) {
      const value =
        env[
          ("POLAR_PRODUCT_" +
            plan.toUpperCase() +
            "_" +
            interval.toUpperCase()) as keyof Bindings
        ];
      if (value && value === id) return { plan, interval };
    }
  return null;
}
function epoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Math.floor(Date.parse(value) / 1000);
  return Number.isFinite(time) ? time : null;
}
export function paidCoverage(order: models.Order) {
  if (!order.paid || !["paid", "partially_refunded"].includes(order.status))
    return null;
  const service = order.items.filter(
    (i) => i.amount > 0 && i.start_timestamp && i.end_timestamp,
  );
  if (!service.length) return null;
  const start = Math.min(...service.map((i) => epoch(i.start_timestamp)!)),
    end = Math.max(...service.map((i) => epoch(i.end_timestamp)!));
  return end > start ? { start, end } : null;
}
async function acquire(env: Bindings, id: string): Promise<string> {
  const token = crypto.randomUUID();
  const result = await env.MAIN_DB.prepare(
    "INSERT INTO billing_locks(id,token,expires_at) VALUES(?,?,unixepoch()+90) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<unixepoch()",
  )
    .bind(id, token)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message: "Billing is updating. Try again shortly.",
    });
  return token;
}
async function release(env: Bindings, id: string, token: string) {
  await env.MAIN_DB.prepare("DELETE FROM billing_locks WHERE id=? AND token=?")
    .bind(id, token)
    .run();
}
export async function checkout(
  env: Bindings,
  accountId: string,
  plan: Plan,
  interval: BillingInterval,
) {
  requireBillingReady(env);
  const client = polar(env),
    lock = "billing:" + accountId,
    token = await acquire(env, lock);
  try {
    const subscriptions = await client.subscriptions.list({
      external_customer_id: accountId,
      limit: 100,
    });
    if (
      subscriptions.items.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      throw new HTTPException(409, {
        message:
          "Manage your existing subscription instead of starting another",
      });
    const access = await accountAccess(env, accountId),
      currentUsage = await accountUsage(env, access),
      target = PLANS[plan];
    if (
      (target.maxProjects !== null &&
        currentUsage.blogs > target.maxProjects) ||
      currentUsage.people > target.maxAccountMembers ||
      currentUsage.storageBytes > target.storageBytes
    )
      throw new HTTPException(409, {
        message:
          "Reduce blog, people or storage usage to fit this plan before subscribing",
      });
    const previous = await env.MAIN_DB.prepare(
      "SELECT * FROM billing_checkouts WHERE account_id=?",
    )
      .bind(accountId)
      .first<{
        provider_id: string;
        plan: string;
        interval: string;
        url: string;
      }>();
    if (previous) {
      const session = await client.checkouts.get(previous.provider_id);
      if (session.status === "open") {
        if (previous.plan !== plan || previous.interval !== interval)
          throw new HTTPException(409, {
            message:
              "Finish or let your existing checkout expire before choosing a different option",
          });
        return previous.url;
      }
      if (session.status === "succeeded")
        throw new HTTPException(409, {
          message: "Your payment is being confirmed. Refresh billing shortly.",
        });
    }
    await env.MAIN_DB.prepare(
      "UPDATE account_billing SET pending_plan=?,pending_interval=? WHERE account_id=?",
    )
      .bind(plan, interval, accountId)
      .run();
    const owner = await env.MAIN_DB.prepare(
      "SELECT u.email FROM users u JOIN accounts a ON a.owner_id=u.id WHERE a.id=?",
    )
      .bind(accountId)
      .first<{ email: string }>();
    const session = await client.checkouts.create({
      products: [productId(env, plan, interval)],
      external_customer_id: accountId,
      customer_email: owner!.email,
      allow_trial: false,
      allow_discount_codes: false,
      success_url: env.FRONTEND_URL + "/settings?checkout=complete",
      return_url: env.FRONTEND_URL + "/settings",
      metadata: { account_id: accountId, plan, interval },
    });
    await env.MAIN_DB.prepare(
      "INSERT INTO billing_checkouts(account_id,provider_id,plan,interval,url) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET provider_id=excluded.provider_id,plan=excluded.plan,interval=excluded.interval,url=excluded.url",
    )
      .bind(accountId, session.id, plan, interval, session.url)
      .run();
    return session.url;
  } finally {
    await release(env, lock, token);
  }
}
export async function changePlan(
  env: Bindings,
  accountId: string,
  plan: Plan,
  interval: BillingInterval,
) {
  requireBillingReady(env);
  const lock = "billing:" + accountId,
    token = await acquire(env, lock);
  try {
    const access = await accountAccess(env, accountId);
    if (!access.provider_subscription_id)
      throw new HTTPException(409, { message: "Start a subscription first" });
    // SQL triggers validate and reserve target resource capacity atomically.
    await env.MAIN_DB.prepare(
      "UPDATE account_billing SET pending_plan=?,pending_interval=?,updated_at=unixepoch() WHERE account_id=?",
    )
      .bind(plan, interval, accountId)
      .run();
    const immediate =
      PLANS[plan].monthly > PLANS[access.plan].monthly &&
      access.interval === interval;
    try {
      await polar(env).subscriptions.update(access.provider_subscription_id, {
        product_id: productId(env, plan, interval),
        proration_behavior: immediate ? "invoice" : "next_period",
      });
    } finally {
      // Even an ambiguous network failure is reconciled against the provider.
      await env.MAIN_DB.prepare(
        "INSERT OR IGNORE INTO background_jobs(id,kind,payload) VALUES(?,'reconcile',?)",
      )
        .bind("change:" + crypto.randomUUID(), JSON.stringify({ accountId }))
        .run();
    }
    return {
      pending: true,
      effective: immediate ? "after_payment" : "next_period",
    };
  } finally {
    await release(env, lock, token);
  }
}
export async function portal(env: Bindings, accountId: string) {
  const session = await polar(env).customerSessions.create({
    external_customer_id: accountId,
    return_url: env.FRONTEND_URL + "/settings",
  });
  return session.customer_portal_url;
}
export async function receivePayment(
  env: Bindings,
  body: string,
  headers: Record<string, string>,
) {
  if (!env.POLAR_WEBHOOK_SECRET)
    throw new HTTPException(503, {
      message: "Billing notifications are not configured",
    });
  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(
      body,
      headers,
      env.POLAR_WEBHOOK_SECRET,
    );
  } catch {
    throw new HTTPException(401, { message: "Invalid payment signature" });
  }
  const id = headers["webhook-id"];
  if (!id || id.length > 200)
    throw new HTTPException(400, { message: "Missing webhook delivery ID" });
  await env.MAIN_DB.batch([
    env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO payment_events(id,type,payload) VALUES(?,?,?)",
    ).bind(id, event.type, JSON.stringify(event)),
    env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO background_jobs(id,kind,payload) VALUES(?,'payment',?)",
    ).bind("payment:" + id, JSON.stringify({ eventId: id })),
  ]);
  return id;
}
export async function reconcileAccount(
  env: Bindings,
  accountId: string,
  eventOrderId?: string,
) {
  const lock = "billing:" + accountId,
    token = await acquire(env, lock);
  try {
    const client = polar(env);
    const checkoutRow = await env.MAIN_DB.prepare(
      "SELECT provider_id,plan,interval FROM billing_checkouts WHERE account_id=?",
    )
      .bind(accountId)
      .first<{ provider_id: string; plan: Plan; interval: BillingInterval }>();
    let openCheckout: typeof checkoutRow = null;
    if (checkoutRow) {
      const session = await client.checkouts.get(checkoutRow.provider_id);
      if (["open", "confirmed"].includes(session.status))
        openCheckout = checkoutRow;
      else if (session.status !== "succeeded")
        await env.MAIN_DB.prepare(
          "DELETE FROM billing_checkouts WHERE account_id=?",
        )
          .bind(accountId)
          .run();
    }
    let state: models.CustomerState;
    try {
      state = await client.customers.getStateExternal(accountId);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        await env.MAIN_DB.prepare(
          "UPDATE account_billing SET pending_plan=?,pending_interval=? WHERE account_id=?",
        )
          .bind(
            openCheckout?.plan ?? null,
            openCheckout?.interval ?? null,
            accountId,
          )
          .run();
        return accountAccess(env, accountId);
      }
      throw error;
    }
    const [ordersResult, subscriptions] = await Promise.all([
      client.orders.list({ external_customer_id: accountId, limit: 100 }),
      client.subscriptions.list({
        external_customer_id: accountId,
        limit: 100,
      }),
    ]);
    const orders = [...ordersResult.items];
    if (eventOrderId && !orders.some((o) => o.id === eventOrderId))
      orders.push(await client.orders.get(eventOrderId));
    const statements = [];
    for (const order of orders) {
      if (order.customer.external_id !== accountId) continue;
      const product = identifyProduct(env, order.product_id);
      if (!product || !order.subscription_id) continue;
      const coverage = paidCoverage(order);
      if (coverage) {
        statements.push(
          env.MAIN_DB.prepare(
            "INSERT INTO paid_orders(id,account_id,subscription_id,plan,interval,period_start,period_end,paid_at,refunded) VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET refunded=0,period_start=excluded.period_start,period_end=excluded.period_end",
          ).bind(
            order.id,
            accountId,
            order.subscription_id,
            product.plan,
            product.interval,
            coverage.start,
            coverage.end,
            epoch(order.modified_at) || epoch(order.created_at) || 0,
          ),
        );
      } else if (
        order.status === "refunded" ||
        (order.refunded_amount >= order.net_amount && order.refunded_amount > 0)
      ) {
        statements.push(
          env.MAIN_DB.prepare(
            "UPDATE paid_orders SET refunded=1 WHERE id=? AND account_id=?",
          ).bind(order.id, accountId),
        );
      } else if (order.paid)
        throw new Error(
          "Paid subscription order has no verified service period",
        );
    }
    if (statements.length) await env.MAIN_DB.batch(statements);
    const paid = await env.MAIN_DB.prepare(
      "SELECT * FROM paid_orders WHERE account_id=? AND refunded=0 AND period_start<=unixepoch() ORDER BY period_start DESC,paid_at DESC LIMIT 1",
    )
      .bind(accountId)
      .first<{
        subscription_id: string;
        plan: Plan;
        interval: BillingInterval;
        period_start: number;
        period_end: number;
      }>();
    const latest =
      subscriptions.items.find((s) => s.id === paid?.subscription_id) ??
      subscriptions.items[0];
    let through = paid?.period_end ?? null;
    // Explicit revocation can shorten access. A failed renewal's advanced period
    // never extends coverage: only paid order service dates are used above.
    if (through && latest?.ended_at)
      through = Math.min(through, epoch(latest.ended_at)!);
    const scheduled = identifyProduct(
      env,
      latest?.pending_update?.product_id ?? null,
    );
    const remote = identifyProduct(env, latest?.product_id ?? null);
    // An immediate upgrade may be waiting for payment. Reserve its resource
    // ceiling without granting the unpaid plan. Failed provider changes clear it.
    const pending =
      scheduled ??
      (remote &&
      paid &&
      (remote.plan !== paid.plan || remote.interval !== paid.interval)
        ? remote
        : openCheckout);
    await env.MAIN_DB.prepare(
      "UPDATE account_billing SET provider_customer_id=?,provider_subscription_id=?,provider_status=?,cancel_at_period_end=?,plan=COALESCE(?,plan),interval=COALESCE(?,interval),paid_through=?,period_anchor=CASE WHEN paid_through IS NULL OR provider_subscription_id IS NOT ? THEN ? ELSE period_anchor END,trial_started_at=CASE WHEN ? IS NOT NULL THEN COALESCE(trial_started_at,unixepoch()) ELSE trial_started_at END,trial_ends_at=CASE WHEN ? IS NOT NULL THEN MIN(COALESCE(trial_ends_at,unixepoch()),unixepoch()) ELSE trial_ends_at END,pending_plan=?,pending_interval=?,purged_at=CASE WHEN ?>unixepoch() THEN NULL ELSE purged_at END,updated_at=unixepoch() WHERE account_id=?",
    )
      .bind(
        state.id,
        latest?.id ?? null,
        latest?.status ?? "inactive",
        latest?.cancel_at_period_end ? 1 : 0,
        paid?.plan ?? null,
        paid?.interval ?? null,
        through,
        latest?.id ?? null,
        paid?.period_start ?? null,
        paid?.plan ?? null,
        paid?.plan ?? null,
        pending?.plan ?? null,
        pending?.interval ?? null,
        through ?? 0,
        accountId,
      )
      .run();
    if (through && through > Math.floor(Date.now() / 1000))
      await env.MAIN_DB.prepare(
        "DELETE FROM billing_checkouts WHERE account_id=?",
      )
        .bind(accountId)
        .run();
    return accountAccess(env, accountId);
  } finally {
    await release(env, lock, token);
  }
}
export async function processPaymentEvent(env: Bindings, eventId: string) {
  const stored = await env.MAIN_DB.prepare(
    "SELECT payload,processed_at FROM payment_events WHERE id=?",
  )
    .bind(eventId)
    .first<{ payload: string; processed_at: number | null }>();
  if (!stored || stored.processed_at) return;
  const event = JSON.parse(stored.payload) as {
    type: string;
    data: Record<string, unknown>;
  };
  const data = event.data;
  const customer = (
    data.customer && typeof data.customer === "object" ? data.customer : {}
  ) as Record<string, unknown>;
  const customerId = String(
    data.customer_id ??
      customer.id ??
      (event.type.startsWith("customer.") ? data.id : "") ??
      "",
  );
  if (customerId) {
    const authoritative = await polar(env).customers.get(customerId);
    const accountId = authoritative.external_id;
    if (
      accountId &&
      (await env.MAIN_DB.prepare("SELECT id FROM accounts WHERE id=?")
        .bind(accountId)
        .first())
    )
      await reconcileAccount(
        env,
        accountId,
        event.type.startsWith("order.") ? String(data.id) : undefined,
      );
  }
  await env.MAIN_DB.prepare(
    "UPDATE payment_events SET processed_at=unixepoch() WHERE id=?",
  )
    .bind(eventId)
    .run();
}
