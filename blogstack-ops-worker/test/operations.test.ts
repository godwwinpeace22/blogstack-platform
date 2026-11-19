import { test, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fixture } from "../../blogstack-api/test/support.js";
import { startBackup, processBackup, maintainBackups } from "../src/backups.js";
import { notify, collectIssues } from "../src/monitor.js";
import type { Env, Job } from "../src/types.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function bucket() {
  const data = new Map<
    string,
    { bytes: Uint8Array; etag: string; httpMetadata: any }
  >();
  let gets = 0;
  let failKey = "";
  const api = {
    async put(key: string, body: any, options: any = {}) {
      if (key === failKey) throw new Error("Injected interruption");
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      const etag = createHash("md5").update(bytes).digest("hex");
      const object = { bytes, etag, httpMetadata: options.httpMetadata };
      data.set(key, object);
      return { key, etag, size: bytes.length };
    },
    async head(key: string) {
      const v = data.get(key);
      return v
        ? {
            key,
            etag: v.etag,
            size: v.bytes.length,
            httpMetadata: v.httpMetadata,
          }
        : null;
    },
    async get(key: string) {
      gets++;
      const v = data.get(key);
      return v
        ? {
            key,
            etag: v.etag,
            size: v.bytes.length,
            httpMetadata: v.httpMetadata,
            body: new Response(v.bytes).body,
          }
        : null;
    },
    async list({ prefix = "", limit = 100, cursor }: any = {}) {
      const keys = [...data.keys()]
        .sort()
        .filter((k) => k.startsWith(prefix) && (!cursor || k > cursor));
      const selected = keys.slice(0, limit);
      return {
        objects: await Promise.all(selected.map((k) => api.head(k))),
        truncated: keys.length > limit,
        cursor: selected.at(-1),
      };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
  };
  return {
    api: api as unknown as R2Bucket,
    data,
    get gets() {
      return gets;
    },
    fail(key: string) {
      failKey = key;
    },
  };
}
async function setup(count = 0) {
  const source = fixture(),
    state = fixture();
  state.sql.exec(
    readFileSync(
      new URL("../migrations/0001_operations.sql", import.meta.url),
      "utf8",
    ),
  );
  const media = bucket(),
    backups = bucket();
  for (let i = 0; i < count; i++)
    await media.api.put("project/image-" + i + ".png", "image-" + i, {
      httpMetadata: { contentType: "image/png" },
    });
  const jobs: Job[] = [];
  const queue = {
    send: async (message: Job) => jobs.push(message),
    metrics: async () => ({
      backlogCount: 0,
      backlogBytes: 0,
      oldestMessageTimestamp: undefined,
    }),
  };
  const env = {
    STATE: state.env.MAIN_DB,
    SOURCE_DB: source.env.MAIN_DB,
    SOURCE_MEDIA: media.api,
    BACKUPS: backups.api,
    JOBS: queue,
    MAIN_QUEUE: queue,
    MAIN_DEAD: queue,
    OPS_DEAD: queue,
    CF_ACCOUNT_ID: "account",
    SOURCE_DATABASE_ID: "database",
    SOURCE_BUCKET_NAME: "source",
    CF_BACKUP_TOKEN: "test",
    CF_ANALYTICS_TOKEN: "test",
    RESEND_API_KEY: "test",
    EMAIL_FROM: "BlogStack <noreply@mail.example.com>",
    ALERT_EMAIL: "owner@example.com",
    CF_BACKUP_TOKEN_EXPIRES: "2099-01-01T00:00:00Z",
    CF_ANALYTICS_TOKEN_EXPIRES: "2099-01-01T00:00:00Z",
    HEALTH_URLS: JSON.stringify([
      { name: "app", url: "https://app.example.com/health", contains: "ok" },
    ]),
    WORKER_NAMES: '["blogstack-app"]',
  } as unknown as Env;
  let exports = 0;
  const sent: any[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (
      url.startsWith("https://api.cloudflare.com/") &&
      url.endsWith("/export")
    ) {
      exports++;
      return Response.json({
        success: true,
        result:
          exports % 2
            ? { at_bookmark: "bookmark" }
            : {
                status: "complete",
                at_bookmark: "bookmark",
                result: {
                  signed_url:
                    "https://backup.r2.cloudflarestorage.com/export.sql?sig=private",
                },
              },
      });
    }
    if (url.includes("r2.cloudflarestorage.com")) {
      expect(init?.headers?.Authorization).toBeUndefined();
      return new Response("CREATE TABLE example(id TEXT);\n");
    }
    if (url.includes("api.resend.com")) {
      sent.push(JSON.parse(init.body));
      return Response.json({ id: "email-" + sent.length });
    }
    if (url.includes("/graphql"))
      return Response.json({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  {
                    dimensions: { scriptName: "blogstack-app" },
                    sum: { requests: 10, errors: 0 },
                  },
                ],
              },
            ],
          },
        },
        errors: null,
      });
    return new Response('{"ok":true}');
  }) as typeof fetch;
  const drain = async () => {
    let steps = 0;
    while (jobs.length) {
      if (++steps > 30) throw new Error("Unbounded continuation");
      const job = jobs.shift()!;
      if (job.kind === "backup") await processBackup(env, job.id);
    }
  };
  return {
    env,
    source,
    state,
    media,
    backups,
    jobs,
    sent,
    drain,
    get exports() {
      return exports;
    },
  };
}
test("snapshots resume across bounded chunks, preserve SQL and checksums, and reuse unchanged media", async () => {
  const f = await setup(8);
  const first = await startBackup(f.env, true);
  await f.drain();
  const run = f.state.sql
    .query("SELECT * FROM backup_runs WHERE id=?")
    .get(first.id) as any;
  expect(run.status).toBe("complete");
  const state = JSON.parse(run.state);
  expect(state.objects).toBe(8);
  const bytes = f.backups.data.get(state.database.key)!.bytes;
  const sql = new TextDecoder().decode(bytes);
  expect(sql).toContain("CREATE TABLE example");
  const manifest = JSON.parse(
    new TextDecoder().decode(
      f.backups.data.get(state.prefix + "manifest.json")!.bytes,
    ),
  );
  expect(manifest.mediaObjects).toBe(8);
  expect(f.media.gets).toBe(8);
  await startBackup(f.env, true);
  await f.drain();
  expect(f.media.gets).toBe(8);
  expect(
    f.state.sql.query("SELECT COUNT(*) n FROM backup_objects").get(),
  ).toEqual({ n: 8 });
  expect(f.media.data.size).toBe(8); // Backups never delete the source.
});
test("partial copies never become complete and retries recover without losing copied objects", async () => {
  const f = await setup(2);
  const r = await startBackup(f.env, true);
  await processBackup(f.env, r.id);
  await processBackup(f.env, r.id);
  const second = f.media.data.get("project/image-1.png")!;
  const fail =
    "objects/" + encodeURIComponent("project/image-1.png") + "/" + second.etag;
  f.backups.fail(fail);
  await expect(processBackup(f.env, r.id)).rejects.toThrow(
    "BACKUP_STEP_FAILED",
  );
  let run = f.state.sql
    .query("SELECT * FROM backup_runs WHERE id=?")
    .get(r.id) as any;
  expect(run.status).toBe("running");
  expect(
    f.backups.data.has(JSON.parse(run.state).prefix + "manifest.json"),
  ).toBe(false);
  f.backups.fail("");
  await processBackup(f.env, r.id);
  run = f.state.sql
    .query("SELECT * FROM backup_runs WHERE id=?")
    .get(r.id) as any;
  expect(run.status).toBe("complete");
  expect(JSON.parse(run.state).objects).toBe(2);
});
test("a duplicate queue delivery cannot claim an in-flight export", async () => {
  const f = await setup();
  const r = await startBackup(f.env, true);
  await Promise.all([processBackup(f.env, r.id), processBackup(f.env, r.id)]);
  expect(f.exports).toBe(1);
});
test("retention preserves weekly snapshots and recently referenced shared media", async () => {
  const f = await setup();
  const now = Math.floor(Date.now() / 1000);
  const daily = await startBackup(f.env, true, now - 31 * 86400);
  const weekly = await startBackup(f.env, true, now - 60 * 86400);
  for (const [run, kind] of [
    [daily, "daily"],
    [weekly, "weekly"],
  ] as const) {
    f.state.sql.run(
      "UPDATE backup_runs SET status='complete',kind=? WHERE id=?",
      [kind, run.id],
    );
    const row = f.state.sql
      .query("SELECT state FROM backup_runs WHERE id=?")
      .get(run.id) as any;
    await f.backups.api.put(
      JSON.parse(row.state).prefix + "manifest.json",
      "{}",
    );
  }
  await f.backups.api.put("objects/live/version", "live");
  await f.backups.api.put("objects/old/version", "old");
  f.state.sql.run("INSERT INTO backup_objects VALUES(?,?,?,?,?)", [
    "objects/live/version",
    "live",
    "version",
    4,
    now,
  ]);
  f.state.sql.run("INSERT INTO backup_objects VALUES(?,?,?,?,?)", [
    "objects/old/version",
    "old",
    "version",
    3,
    now - 91 * 86400,
  ]);
  await maintainBackups(f.env, now);
  expect(
    f.state.sql.query("SELECT id FROM backup_runs WHERE id=?").get(daily.id),
  ).toBeNull();
  expect(
    f.state.sql.query("SELECT id FROM backup_runs WHERE id=?").get(weekly.id),
  ).not.toBeNull();
  expect(f.backups.data.has("objects/live/version")).toBe(true);
  expect(f.backups.data.has("objects/old/version")).toBe(false);
});
test("incident emails are quiet while unchanged and send one recovery notice", async () => {
  const f = await setup();
  await notify(f.env, [{ code: "app", message: "App failed" }]);
  await notify(f.env, [
    { code: "app", message: "App still failed; count changed" },
  ]);
  await notify(f.env, []);
  await notify(f.env, []);
  expect(f.sent.length).toBe(2);
  expect(f.sent[1].subject).toContain("recovered");
});
test("monitor checks source jobs, dead letters, backup freshness and Worker metrics without exposing content", async () => {
  const f = await setup();
  await startBackup(f.env, true);
  await f.drain();
  expect(await collectIssues(f.env)).toEqual([]);
  f.source.sql.run(
    "INSERT INTO background_jobs(id,kind,payload,status) VALUES('email-failure','email','{}','failed')",
  );
  f.env.MAIN_DEAD = {
    metrics: async () => ({ backlogCount: 1, backlogBytes: 1 }),
  } as Queue;
  const codes = (await collectIssues(f.env)).map((i) => i.code);
  expect(codes).toContain("jobs:email");
  expect(codes).toContain("queue:publishing dead letters");
});
test("monitor reports missing, invalid and expiring credential dates", async () => {
  const f = await setup();
  const now = Date.parse("2026-11-19T15:00:00Z") / 1000;
  const credentials = async () =>
    (await collectIssues(f.env, now)).filter(({ code }) =>
      code.startsWith("credential:"),
    );

  f.env.CF_BACKUP_TOKEN_EXPIRES = undefined;
  f.env.CF_ANALYTICS_TOKEN_EXPIRES = "2027-02-30T23:59:59Z";
  expect(await credentials()).toEqual([
    {
      code: "credential:backup",
      message: "The backup credential has no expiry date configured.",
    },
    {
      code: "credential:analytics",
      message:
        "The analytics credential has an invalid expiry date. Use a UTC timestamp.",
    },
  ]);

  f.env.CF_BACKUP_TOKEN_EXPIRES = "2026-12-19T15:00:00Z";
  f.env.CF_ANALYTICS_TOKEN_EXPIRES = "2026-11-19T15:00:00Z";
  expect(await credentials()).toEqual([
    {
      code: "credential:backup",
      message: "The backup credential expires within 30 days.",
    },
    {
      code: "credential:analytics",
      message: "The analytics credential has expired.",
    },
  ]);
});
test("alert retries and concurrent checks preserve one provider idempotency key and payload", async () => {
  const f = await setup();
  const attempts: { key: string; body: string }[] = [];
  globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
    attempts.push({
      key: new Headers(init.headers).get("Idempotency-Key")!,
      body: String(init.body),
    });
    return attempts.length === 1
      ? new Response("temporary failure", { status: 503 })
      : Response.json({ id: "delivered-once" });
  }) as typeof fetch;
  await expect(
    notify(f.env, [{ code: "app", message: "App failed" }], 100),
  ).rejects.toThrow("ALERT_SEND_FAILED");
  await Promise.all([
    notify(f.env, [{ code: "app", message: "Changed count" }], 200),
    notify(f.env, [{ code: "app", message: "Changed again" }], 201),
  ]);
  expect(new Set(attempts.map((a) => a.key)).size).toBe(1);
  expect(new Set(attempts.map((a) => a.body)).size).toBe(1);
  const count = attempts.length;
  await notify(f.env, [{ code: "app", message: "Still failed" }], 300);
  expect(attempts.length).toBe(count);
});
