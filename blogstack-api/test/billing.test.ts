import { test, expect } from "bun:test";
import {
  checkout,
  changePlan,
  reconcileAccount,
  receivePayment,
  processPaymentEvent,
  identifyProduct,
} from "../src/lib/polar.js";
import { accountAccess } from "../src/lib/entitlements.js";
import { fixture } from "./support.js";
const plans = ["solo", "studio", "growth"] as const,
  intervals = ["month", "year"] as const;
function configure(f: ReturnType<typeof fixture>) {
  Object.assign(f.env, {
    POLAR_ACCESS_TOKEN: "test-only-provider-token",
    POLAR_SERVER: "sandbox",
    POLAR_WEBHOOK_SECRET: "test-only-webhook-secret",
  });
  for (const p of plans)
    for (const i of intervals)
      (f.env as any)[
        "POLAR_PRODUCT_" + p.toUpperCase() + "_" + i.toUpperCase()
      ] = p + "-" + i;
  f.sql.run("DELETE FROM projects WHERE id='p2'");
}
function order(
  f: ReturnType<typeof fixture>,
  id = "order-paid",
  plan = "studio",
  interval = "month",
  start = f.now - 86400,
  end = f.now + 29 * 86400,
) {
  return {
    id,
    customer: { external_id: "account" },
    customer_id: "customer",
    subscription_id: "subscription",
    product_id: plan + "-" + interval,
    paid: true,
    status: "paid",
    created_at: new Date(start * 1000).toISOString(),
    modified_at: null,
    net_amount: 900,
    refunded_amount: 0,
    items: [
      {
        amount: 900,
        start_timestamp: new Date(start * 1000).toISOString(),
        end_timestamp: new Date(end * 1000).toISOString(),
      },
    ],
  };
}
async function mocked<T>(
  handler: (url: URL, init: RequestInit) => Promise<Response> | Response,
  run: () => Promise<T>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: any, init: RequestInit = {}) =>
    handler(new URL(String(input)), init)) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
test("all six checkout choices map only to server-owned products, have no provider trial, and are reused", async () => {
  for (const p of plans)
    for (const i of intervals) {
      const f = fixture();
      configure(f);
      let creations = 0;
      await mocked(
        (url, init) => {
          if (url.pathname === "/v1/subscriptions/")
            return Response.json({ items: [] });
          if (url.pathname === "/v1/checkouts/" && init.method === "POST") {
            creations++;
            const body = JSON.parse(String(init.body));
            expect(body.products).toEqual([p + "-" + i]);
            expect(body.external_customer_id).toBe("account");
            expect(body.allow_trial).toBe(false);
            expect(body.allow_discount_codes).toBe(false);
            return Response.json({
              id: "checkout",
              url: "https://sandbox.polar.sh/checkout/test",
              status: "open",
            });
          }
          if (url.pathname === "/v1/checkouts/checkout")
            return Response.json({ id: "checkout", status: "open" });
          throw new Error("Unexpected provider call " + url.pathname);
        },
        async () => {
          expect(await checkout(f.env, "account", p, i)).toContain(
            "sandbox.polar.sh",
          );
          expect(await checkout(f.env, "account", p, i)).toContain(
            "sandbox.polar.sh",
          );
          expect(creations).toBe(1);
          expect(
            (await accountAccess(f.env, "account")).paid_through,
          ).toBeNull();
        },
      );
      expect(identifyProduct(f.env, p + "-" + i)).toEqual({
        plan: p,
        interval: i,
      });
      expect(identifyProduct(f.env, "attacker-price")).toBeNull();
    }
});
test("an unpaid advanced renewal never grants time; cancellation preserves confirmed coverage and refunds revoke it", async () => {
  const f = fixture();
  configure(f);
  const paid = order(f),
    unpaid = {
      ...order(
        f,
        "unpaid",
        "studio",
        "month",
        f.now + 29 * 86400,
        f.now + 59 * 86400,
      ),
      paid: false,
      status: "pending",
    };
  let items: any[] = [paid, unpaid];
  let subscription: any = {
    id: "subscription",
    product_id: "studio-month",
    status: "past_due",
    current_period_end: new Date((f.now + 59 * 86400) * 1000).toISOString(),
    cancel_at_period_end: false,
    ended_at: null,
    pending_update: null,
  };
  await mocked(
    (url) => {
      if (url.pathname.endsWith("/state"))
        return Response.json({ id: "customer" });
      if (url.pathname === "/v1/orders/") return Response.json({ items });
      if (url.pathname === "/v1/subscriptions/")
        return Response.json({ items: [subscription] });
      throw new Error("Unexpected provider call " + url.pathname);
    },
    async () => {
      await reconcileAccount(f.env, "account");
      let a = await accountAccess(f.env, "account");
      expect(a.paid_through).toBe(f.now + 29 * 86400);
      expect(a.trial_ends_at).toBeLessThanOrEqual(f.now);
      subscription = {
        ...subscription,
        status: "active",
        cancel_at_period_end: true,
      };
      await reconcileAccount(f.env, "account");
      a = await accountAccess(f.env, "account");
      expect(a.paid_through).toBe(f.now + 29 * 86400);
      expect(a.cancel_at_period_end).toBe(1);
      // A delayed old event re-fetches current state rather than applying its old payload.
      await reconcileAccount(f.env, "account");
      expect((await accountAccess(f.env, "account")).paid_through).toBe(
        f.now + 29 * 86400,
      );
      items = [
        {
          ...paid,
          paid: true,
          status: "refunded",
          refunded_amount: paid.net_amount,
        },
        unpaid,
      ];
      subscription = {
        ...subscription,
        status: "canceled",
        ended_at: new Date((f.now - 1) * 1000).toISOString(),
      };
      await reconcileAccount(f.env, "account");
      a = await accountAccess(f.env, "account");
      expect(a.paid_through).toBeNull();
      expect(a.writable).toBe(0);
    },
  );
});
test("scheduled downgrades reserve target capacity and failed provider changes clear on reconciliation", async () => {
  const f = fixture();
  configure(f);
  f.sql.run(
    "UPDATE account_billing SET plan='growth',interval='month',paid_through=?,provider_subscription_id='subscription' WHERE account_id='account'",
    [f.now + 29 * 86400],
  );
  const paid = order(f, "growth-paid", "growth");
  let subscription: any = {
    id: "subscription",
    product_id: "growth-month",
    status: "active",
    cancel_at_period_end: false,
    ended_at: null,
    pending_update: null,
  };
  let mode = "";
  await mocked(
    (url, init) => {
      if (
        url.pathname === "/v1/subscriptions/subscription" &&
        init.method === "PATCH"
      ) {
        const body = JSON.parse(String(init.body));
        mode = body.proration_behavior;
        subscription.pending_update = { product_id: body.product_id };
        return Response.json(subscription);
      }
      if (url.pathname.endsWith("/state"))
        return Response.json({ id: "customer" });
      if (url.pathname === "/v1/orders/")
        return Response.json({ items: [paid] });
      if (url.pathname === "/v1/subscriptions/")
        return Response.json({ items: [subscription] });
      throw new Error("Unexpected provider call " + url.pathname);
    },
    async () => {
      await changePlan(f.env, "account", "solo", "month");
      expect(mode).toBe("next_period");
      expect((await accountAccess(f.env, "account")).max_blogs).toBe(1);
      expect(() =>
        f.sql.run(
          "INSERT INTO projects(id,account_id,name,slug,created_by,created_at) VALUES('second','account','Second','second','owner',1)",
        ),
      ).toThrow("BLOG_LIMIT");
      await reconcileAccount(f.env, "account");
      expect((await accountAccess(f.env, "account")).pending_plan).toBe("solo");
      subscription.pending_update = null;
      await reconcileAccount(f.env, "account");
      expect((await accountAccess(f.env, "account")).pending_plan).toBeNull();
      expect((await accountAccess(f.env, "account")).plan).toBe("growth");
    },
  );
});
test("signed notifications deduplicate durably and invalid signatures cannot create jobs", async () => {
  const f = fixture();
  configure(f);
  const id = "delivery-1",
    timestamp = String(f.now),
    body = JSON.stringify({
      type: "order.paid",
      data: { id: "order-paid", customer_id: "customer" },
    });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(f.env.POLAR_WEBHOOK_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(id + "." + timestamp + "." + body),
    ),
  ).toString("base64");
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": "v1," + signature,
  };
  await receivePayment(f.env, body, headers);
  await receivePayment(f.env, body, headers);
  expect(f.sql.query("SELECT COUNT(*) n FROM payment_events").get()).toEqual({
    n: 1,
  });
  expect(
    f.sql
      .query("SELECT COUNT(*) n FROM background_jobs WHERE kind='payment'")
      .get(),
  ).toEqual({ n: 1 });
  await expect(receivePayment(f.env, body + " ", headers)).rejects.toThrow(
    "Invalid payment signature",
  );
  const paid = order(f);
  await mocked(
    (url) => {
      if (url.pathname === "/v1/customers/customer")
        return Response.json({ id: "customer", external_id: "account" });
      if (url.pathname.endsWith("/state"))
        return Response.json({ id: "customer" });
      if (url.pathname === "/v1/orders/")
        return Response.json({ items: [paid] });
      if (url.pathname === "/v1/subscriptions/")
        return Response.json({
          items: [
            {
              id: "subscription",
              product_id: "studio-month",
              status: "active",
              cancel_at_period_end: false,
              pending_update: null,
              ended_at: null,
            },
          ],
        });
      throw new Error("Unexpected provider call " + url.pathname);
    },
    async () => {
      await processPaymentEvent(f.env, id);
      await processPaymentEvent(f.env, id);
    },
  );
  expect(
    (
      f.sql
        .query("SELECT processed_at FROM payment_events WHERE id=?")
        .get(id) as any
    ).processed_at,
  ).not.toBeNull();
  expect(f.sql.query("SELECT COUNT(*) n FROM paid_orders").get()).toEqual({
    n: 1,
  });
});
