import { test, expect } from "bun:test";
import { fixture } from "./support.js";
import { app } from "../src/index.js";
import {
  accountAccess,
  reserveUsage,
  usagePeriod,
} from "../src/lib/entitlements.js";
import { runLifecycle } from "../src/lib/lifecycle.js";

test("internal access survives expiry without paid coverage, while ordinary accounts expire and purge", async () => {
  const f = fixture();
  f.sql.run(
    "INSERT INTO accounts(id,owner_id,created_at) VALUES('customer','other',?)",
    [f.now],
  );
  f.sql.run(
    "INSERT INTO projects(id,account_id,name,slug,created_by,created_at) VALUES('customer-project','customer','Customer','customer','other',?)",
    [f.now],
  );
  f.sql.run("UPDATE account_billing SET trial_ends_at=?,paid_through=NULL", [
    f.now - 120 * 86400,
  ]);
  f.sql.run(
    "UPDATE account_billing SET internal_access=1 WHERE account_id='account'",
  );
  const internal = await accountAccess(f.env, "account");
  expect(internal.writable).toBe(1);
  expect(internal.public_delivery).toBe(1);
  expect(internal.access_until).toBe(0);
  expect(internal.paid_through).toBeNull();
  expect((await accountAccess(f.env, "customer")).writable).toBe(0);
  await runLifecycle(f.env);
  expect(
    f.sql
      .query("SELECT COUNT(*) AS n FROM projects WHERE account_id='account'")
      .get(),
  ).toEqual({ n: 2 });
  expect(
    f.sql.query("SELECT id FROM projects WHERE account_id='customer'").get(),
  ).toBeNull();
  expect(
    f.sql
      .query(
        "SELECT COUNT(*) AS n FROM lifecycle_notices WHERE account_id='account'",
      )
      .get(),
  ).toEqual({ n: 0 });
  const response = await app.fetch(
    new Request("http://localhost:8787/accounts/account/billing", {
      headers: { Cookie: await f.session() },
    }),
    f.env,
    f.ctx,
  );
  const data = (await response.json()) as any;
  expect(data).toMatchObject({
    status: "internal",
    internalAccess: true,
    canWrite: true,
    trialEndsAt: null,
    paidThrough: null,
    deliveryEndsAt: null,
    deletesAt: null,
    configured: false,
  });
  expect(f.sql.query("SELECT COUNT(*) AS n FROM paid_orders").get()).toEqual({
    n: 0,
  });
  f.sql.run(
    "UPDATE account_billing SET purged_at=? WHERE account_id='account'",
    [f.now],
  );
  expect((await accountAccess(f.env, "account")).writable).toBe(0);
});

test("internal workspaces retain shared limits and customers cannot grant themselves internal access", async () => {
  const f = fixture();
  const response = await app.fetch(
    new Request("http://localhost:8787/accounts/me", {
      method: "PATCH",
      headers: {
        Cookie: await f.session(),
        Origin: f.env.FRONTEND_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ internalAccess: true, internal_access: 1 }),
    }),
    f.env,
    f.ctx,
  );
  expect(response.status).toBe(200);
  expect((await accountAccess(f.env, "account")).internal_access).toBe(0);
  f.sql.run(
    "UPDATE account_billing SET internal_access=1 WHERE account_id='account'",
  );
  const access = await accountAccess(f.env, "account");
  await reserveUsage(f.env, access, "first", "ai", access.ai_credits);
  await expect(reserveUsage(f.env, access, "over", "ai", 1)).rejects.toThrow();
  expect(
    f.sql
      .query(
        "SELECT used FROM usage_counters WHERE account_id='account' AND period_start=? AND metric='ai'",
      )
      .get(usagePeriod(access)),
  ).toEqual({ used: access.ai_credits });
  f.sql.run(
    "UPDATE account_billing SET internal_access=0,trial_ends_at=? WHERE account_id='account'",
    [f.now - 1],
  );
  expect((await accountAccess(f.env, "account")).writable).toBe(0);
});
