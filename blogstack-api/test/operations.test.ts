import { test, expect } from "bun:test";
import { fixture } from "./support.js";
import { app } from "../src/index.js";
test("operations require the verified operator session and remain available after trial expiry", async () => {
  const f = fixture();
  f.env.OPERATOR_EMAIL = "owner@example.com";
  let calls = 0;
  f.env.OPERATIONS = {
    fetch: async () => {
      calls++;
      return Response.json({ enabled: true });
    },
  } as Fetcher;
  const call = (cookie?: string, headers: Record<string, string> = {}) =>
    app.fetch(
      new Request("http://localhost:8787/internal/operations/status", {
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
      }),
      f.env,
      f.ctx,
    );
  expect((await call()).status).toBe(401);
  expect((await call(await f.session("other"))).status).toBe(403);
  expect((await call(undefined, { "x-api-key": await f.key() })).status).toBe(
    403,
  );
  f.sql.run(
    "UPDATE account_billing SET trial_ends_at=? WHERE account_id='account'",
    [f.now - 100 * 86400],
  );
  expect((await call(await f.session())).status).toBe(200);
  expect(calls).toBe(1);
  const crossOrigin = await app.fetch(
    new Request("http://localhost:8787/internal/operations/backup", {
      method: "POST",
      headers: {
        Cookie: await f.session(),
        Origin: "https://attacker.example",
      },
    }),
    f.env,
    f.ctx,
  );
  expect(crossOrigin.status).toBe(403);
  expect(calls).toBe(1);
  f.sql.run("UPDATE users SET email_verified=0 WHERE id='owner'");
  expect((await call(await f.session())).status).toBe(403);
});
test("logical media removal denies CDN delivery during the 48-hour physical deletion grace", async () => {
  const f = fixture();
  f.env.MEDIA_DELETE_GRACE_SECONDS = "172800";
  f.sql.run(
    "INSERT INTO media(id,project_id,key,url,filename,mime_type,uploaded_by,confirmed,size,created_at) VALUES('image','p1','p1/image.jpg','https://cdn.example/p1/image.jpg','image.jpg','image/jpeg','owner',1,10,?)",
    [f.now],
  );
  f.objects.set("p1/image.jpg", { size: 10 });
  const result = await app.fetch(
    new Request("http://localhost:8787/projects/p1/media/image", {
      method: "DELETE",
      headers: { Cookie: await f.session(), Origin: f.env.FRONTEND_URL },
    }),
    f.env,
    f.ctx,
  );
  expect(result.status).toBe(204);
  expect(f.objects.has("p1/image.jpg")).toBe(true);
  let reads = 0;
  const { default: cdn } = await import(
    "../../blogstack-cdn-worker/src/index.js"
  );
  const response = await cdn.fetch(
    new Request("https://cdn.example/p1%2Fimage.jpg"),
    {
      MAIN_DB: f.env.MAIN_DB,
      CDN_CACHE: f.env.CDN_CACHE,
      CDN_SECRET: "test",
      API_BASE_URL: f.env.API_URL,
      R2: {
        get: async () => {
          reads++;
          return null;
        },
      } as unknown as R2Bucket,
    },
  );
  expect(response.status).toBe(404);
  expect(reads).toBe(0);
  const { runLifecycle } = await import("../src/lib/lifecycle.js");
  await runLifecycle(f.env, f.now + 172799);
  expect(f.objects.has("p1/image.jpg")).toBe(true);
  expect(f.sql.query("SELECT key FROM r2_deletions").get()).not.toBeNull();
  await runLifecycle(f.env, f.now + 172801);
  expect(f.objects.has("p1/image.jpg")).toBe(false);
  expect(f.sql.query("SELECT key FROM r2_deletions").get()).toBeNull();
});
test("deferred media cleanup retains R2 bytes until explicit physical purge", async () => {
  const f = fixture();
  f.env.MEDIA_DELETE_GRACE_SECONDS = "172800";
  const { deleteMedia } = await import("../src/lib/r2.js");
  f.objects.set("p1/image.png", { size: 10 });
  await deleteMedia(f.env, "p1/image.png", "test-media");
  expect(f.objects.has("p1/image.png")).toBe(true);
  expect(f.sql.query("SELECT key FROM r2_deletions").get()).toEqual({
    key: "p1/image.png",
  });
  await deleteMedia(f.env, "p1/image.png", "test-media", true);
  expect(f.objects.has("p1/image.png")).toBe(false);
});
