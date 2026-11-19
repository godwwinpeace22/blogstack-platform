import { describe, expect, test } from "bun:test";
import { app } from "../src/index.js";
import {
  accountAccess,
  limitsFor,
  reserveUsage,
  settleUsage,
  usage,
  usagePeriod,
} from "../src/lib/entitlements.js";
import { runLifecycle } from "../src/lib/lifecycle.js";
import { fixture } from "./support.js";
import {
  validateInstall,
  workerConfigs,
  selfHostedSql,
  secretsFor,
} from "../../scripts/lib/self-hosting.mjs";

const config = validateInstall({
  name: "test-publication",
  accountId: "0".repeat(32),
  workersSubdomain: "example",
  operatorEmail: "owner@example.com",
  emailFrom: "BlogStack <noreply@example.com>",
});
function selfHosted() {
  const f = fixture();
  f.sql.exec(
    "UPDATE deployment_settings SET mode='self_hosted',max_people=3,ai_credits=12,link_checks=20,analytics_days=730,max_posts=2;",
  );
  f.env.DEPLOYMENT_MODE = "self_hosted";
  return f;
}
async function request(
  f: ReturnType<typeof fixture>,
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  key?: string,
) {
  return app.request(
    path,
    {
      method,
      headers: {
        origin: f.env.FRONTEND_URL,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(key ? { "x-api-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    f.env,
    f.ctx,
  );
}
describe("operator-owned full-platform installations", () => {
  test("managed is the migration default and installer refuses an existing managed account database", async () => {
    const f = fixture();
    f.sql.run("UPDATE account_billing SET trial_ends_at=?", [f.now - 1]);
    f.sql.exec(selfHostedSql(config));
    expect((await accountAccess(f.env, "account")).writable).toBe(0);
    expect(f.sql.query("SELECT mode FROM deployment_settings").get()).toEqual({
      mode: "hosted",
    });
    const cookie = await f.session();
    const response = await app.request(
      "/projects",
      {
        method: "POST",
        headers: {
          origin: f.env.FRONTEND_URL,
          cookie,
          "content-type": "application/json",
          "x-blogstack-deployment-mode": "self_hosted",
        },
        body: JSON.stringify({ name: "Bypass" }),
      },
      f.env,
      f.ctx,
    );
    expect(response.status).toBe(402);
  });
  test("no trial, expiry purging or subscriptions; owner authorization still applies", async () => {
    const f = selfHosted();
    f.sql.run("UPDATE account_billing SET trial_ends_at=?,paid_through=NULL", [
      f.now - 100 * 86400,
    ]);
    const a = await accountAccess(f.env, "account");
    expect(a.self_hosted).toBe(1);
    expect(a.writable).toBe(1);
    expect(a.public_delivery).toBe(1);
    expect(a.access_until).toBe(0);
    const cookie = await f.session();
    const billing = await (
      await request(f, "/accounts/account/billing", "GET", undefined, cookie)
    ).json();
    expect(billing.status).toBe("self_hosted");
    expect(billing.configured).toBe(false);
    expect(billing.trialEndsAt).toBeNull();
    expect(billing.deletesAt).toBeNull();
    expect(
      (
        await request(
          f,
          "/accounts/account/billing/checkout",
          "POST",
          { plan: "growth", interval: "month" },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (await request(f, "/billing/webhooks/polar", "POST", {})).status,
    ).toBe(409);
    expect(
      (
        await request(
          f,
          "/accounts/account/billing",
          "GET",
          undefined,
          await f.session("other"),
        )
      ).status,
    ).toBe(403);
    await runLifecycle(f.env);
    expect(
      (f.sql.query("SELECT COUNT(*) AS n FROM projects").get() as { n: number })
        .n,
    ).toBe(2);
    expect(
      (
        f.sql.query("SELECT COUNT(*) AS n FROM lifecycle_notices").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
    expect(
      (
        await request(
          f,
          "/projects",
          "POST",
          { name: "New self-hosted blog" },
          cookie,
        )
      ).status,
    ).toBe(201);
  });
  test("new self-hosted accounts never start a trial and operator budgets remain atomic", async () => {
    const f = selfHosted();
    f.sql.run(
      "INSERT INTO accounts(id,owner_id,plan,created_at) VALUES('new-self-hosted','other','hobby',unixepoch())",
    );
    f.sql.run(
      "INSERT INTO projects(id,account_id,name,slug,created_by,created_at) VALUES('self-p','new-self-hosted','Self','self-p','other',unixepoch())",
    );
    const a = await accountAccess(f.env, "new-self-hosted");
    expect(a.trial_started_at).toBeNull();
    expect(a.trial_ends_at).toBeNull();
    expect(limitsFor(a)).toMatchObject({
      maxProjects: null,
      maxAccountMembers: 3,
      aiCredits: 12,
      linkChecks: 20,
      analyticsDays: 730,
      maxPostsPerProject: 2,
      customBranding: true,
    });
    const reservations = await Promise.allSettled([
      reserveUsage(f.env, a, "r1", "ai", 8),
      reserveUsage(f.env, a, "r2", "ai", 8),
    ]);
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
    expect((await usage(f.env, a)).ai).toBe(8);
    await settleUsage(f.env, "r1", 2);
    expect((await usage(f.env, a)).ai).toBe(2);
    expect(usagePeriod(a, Date.UTC(2026, 10, 29) / 1000)).toBe(
      Date.UTC(2026, 10, 1) / 1000,
    );
    expect(usagePeriod(a, Date.UTC(2026, 11, 1) / 1000)).toBe(
      Date.UTC(2026, 11, 1) / 1000,
    );
  });
  test("published content, private revisions, media delivery access and configurable post limits work without paid coverage", async () => {
    const f = selfHosted(),
      key = await f.key();
    const created = await request(
      f,
      "/projects/p1/posts",
      "POST",
      { title: "Self-hosted story" },
      undefined,
      key,
    );
    expect(created.status).toBe(201);
    const post = await created.json();
    const path = "/projects/p1/posts/" + post.id;
    expect(
      (
        await request(
          f,
          path,
          "PATCH",
          {
            revision: 1,
            content: JSON.stringify([
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "An independently hosted article." },
                ],
              },
            ]),
          },
          undefined,
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          f,
          path + "/publish",
          "POST",
          { revision: 2 },
          undefined,
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await request(f, "/public/p1/posts/self-hosted-story")).json())
        .renderedHtml,
    ).toContain("independently hosted article");
    expect(
      (
        await request(
          f,
          path,
          "PATCH",
          { revision: 2, title: "Private revision" },
          undefined,
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await request(f, "/public/p1/posts/self-hosted-story")).json())
        .title,
    ).toBe("Self-hosted story");
    expect(
      (
        await request(
          f,
          "/projects/p1/posts",
          "POST",
          { title: "Second" },
          undefined,
          key,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          f,
          "/projects/p1/posts",
          "POST",
          { title: "Too many" },
          undefined,
          key,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          f,
          "/projects/p2/posts",
          "POST",
          { title: "Cross-project attempt" },
          undefined,
          key,
        )
      ).status,
    ).toBe(403);
  });
  test("worker generation isolates credentials and egress, names analytics datasets per installation and uses own resources", () => {
    const resources = {
      d1_databases: [
        {
          binding: "MAIN_DB",
          database_name: "test-db",
          database_id: "own-main-db",
        },
        {
          binding: "STATE",
          database_name: "test-state",
          database_id: "own-state-db",
        },
      ],
      kv_namespaces: [
        { binding: "CACHE", id: "own-cache" },
        { binding: "CDN_CACHE", id: "own-cdn-cache" },
      ],
    };
    const configs = workerConfigs(
      { ...config, features: { ...config.features, operations: true } },
      resources,
    );
    expect(configs.app.vars.CHECKOUT_ENABLED).toBe("false");
    expect(configs.app.vars.SIGNUP_MODE).toBe("pilot");
    expect(configs.app.vars.API_URL).toBe(
      "https://test-publication-app.example.workers.dev",
    );
    expect(configs.app.vars.ANALYTICS_DATASET).toBe(
      "bs_test_publication_events",
    );
    expect(configs.cdn.d1_databases[0].database_id).toBe(
      configs.app.d1_databases[0].database_id,
    );
    expect(configs.links.workers_dev).toBe(false);
    expect(configs.links.compatibility_flags).toContain(
      "global_fetch_strictly_public",
    );
    expect(configs.links.d1_databases).toBeUndefined();
    expect(configs.links.services).toBeUndefined();
    const secrets = {
      BETTER_AUTH_SECRET: "auth",
      CDN_SECRET: "upload",
      RESEND_API_KEY: "email",
      CF_ANALYTICS_TOKEN: "analytics",
      CF_BACKUP_TOKEN: "backup",
      POLAR_ACCESS_TOKEN: "never-upload-this",
    };
    expect(secretsFor("cdn", secrets)).toEqual({ CDN_SECRET: "upload" });
    expect(secretsFor("links", secrets)).toEqual({});
    expect(secretsFor("app", secrets)).not.toHaveProperty("CF_BACKUP_TOKEN");
    expect(secretsFor("app", secrets)).not.toHaveProperty("POLAR_ACCESS_TOKEN");
    expect(configs.ops.workers_dev).toBe(false);
    expect(configs.ops.r2_buckets[1].bucket_name).toBe(
      "test-publication-backups",
    );
    const dev = workerConfigs(config, resources, { local: true });
    expect(dev.app.ai).toBeUndefined();
    expect(dev.app.analytics_engine_datasets).toBeUndefined();
  });
  test("unsafe installation names, SQL budgets, sender injection and malformed account IDs fail before provisioning", () => {
    for (const input of [
      { name: "../production" },
      { accountId: "wrong-account" },
      { workersSubdomain: "example.workers.dev/path" },
      { emailFrom: "name@example.com\nBcc: victim@example.com" },
      { limits: { aiCredits: "1; DROP TABLE users" } },
      { limits: { maxBlogs: -1 } },
    ])
      expect(() => validateInstall({ ...config, ...input })).toThrow();
  });
});
