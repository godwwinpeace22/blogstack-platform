import { test, expect } from "bun:test";
import { app } from "../src/index.js";
import { analyticsReport, persistSnapshot } from "../src/lib/analytics.js";
import {
  startLinkScan,
  processLinkScan,
  linkReport,
} from "../src/lib/links.js";
import {
  accountAccess,
  reserveUsage,
  settleUsage,
  usage,
  usagePeriod,
} from "../src/lib/entitlements.js";
import { fixture } from "./support.js";
import { processJob } from "../src/lib/jobs.js";
function seed(f: ReturnType<typeof fixture>) {
  const content = JSON.stringify([
    {
      type: "paragraph",
      content: [
        {
          type: "link",
          href: "https://destination.example/path?private=value",
          content: [{ type: "text", text: "Read more" }],
        },
      ],
    },
  ]);
  f.sql.run(
    "INSERT INTO posts(id,project_id,title,slug,content,rendered_html,status,author_id,published_at,created_at,updated_at) VALUES('event-post','p1','Event article','event',?,'<p>Body</p>','published','owner',?,?,?)",
    [content, f.now, f.now, f.now],
  );
}
test("collector stores only authorized public view/click dimensions and respects opt-out, bot and preview exclusions", async () => {
  const f = fixture();
  seed(f);
  const points: any[] = [];
  (f.env as any).ANALYTICS = {
    writeDataPoint: (point: any) => points.push(point),
  };
  async function event(body: any, headers: Record<string, string> = {}) {
    return app.request(
      "/public/p1/events",
      {
        method: "POST",
        headers: {
          origin: "https://example.com",
          "Content-Type": "text/plain",
          "User-Agent": "Mozilla/5.0",
          "CF-Connecting-IP": "192.0.2.100",
          ...headers,
        },
        body: JSON.stringify(body),
      },
      f.env,
      f.ctx,
    );
  }
  expect(
    (
      await event({
        postId: "event-post",
        type: "view",
        referrer: "https://news.example/private-article?private=value",
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await event({
        postId: "event-post",
        type: "click",
        destination: "https://destination.example/path?private=value",
        referrer: "https://news.example/private-article?private=value",
      })
    ).status,
  ).toBe(204);
  expect(points).toHaveLength(2);
  expect(points[1]).toEqual({
    indexes: ["account"],
    blobs: [
      "p1",
      "event-post",
      "click",
      "news.example",
      "https://destination.example/path",
    ],
    doubles: [1],
  });
  expect(JSON.stringify(points)).not.toContain("private");
  expect(JSON.stringify(points)).not.toContain("192.0.2");
  expect(JSON.stringify(points)).not.toContain("Mozilla");
  for (const headers of [
    { dnt: "1" },
    { "sec-gpc": "1" },
    { "User-Agent": "Googlebot" },
    { origin: "http://localhost:3001" },
  ])
    await event({ postId: "event-post", type: "view" }, headers);
  await event({ postId: "event-post", type: "view", preview: true });
  await event({
    postId: "event-post",
    type: "click",
    destination: "https://arbitrary.example/not-an-article-link",
  });
  expect(points).toHaveLength(2);
});
test("sampling-aware aggregates clamp retention and snapshots replace rather than duplicate history", async () => {
  const f = fixture();
  seed(f);
  f.sql.run(
    "UPDATE account_billing SET plan='solo' WHERE account_id='account'",
  );
  const queries: string[] = [],
    original = globalThis.fetch;
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  f.sql.run(
    "INSERT INTO analytics_daily(project_id,day,post_id,kind,dimension,total) VALUES('p1',?,'event-post','view','',999)",
    [old],
  );
  f.env.CF_ACCOUNT_ID = "test-account";
  f.env.CF_ANALYTICS_TOKEN = "test-analytics-token";
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toContain("analytics_engine/sql");
    const sql = String(init?.body);
    queries.push(sql);
    if (sql.includes("GROUP BY blob2,blob3"))
      return Response.json({
        data: [
          { post_id: "event-post", kind: "view", total: 20, sample: 2 },
          { post_id: "event-post", kind: "click", total: 10, sample: 2 },
        ],
      });
    if (sql.includes("GROUP BY blob4"))
      return Response.json({
        data: [{ dimension: "news.example", total: 20, sample: 2 }],
      });
    return Response.json({
      data: [
        {
          post_id: "event-post",
          dimension: "https://destination.example/path",
          total: 10,
          sample: 2,
        },
      ],
    });
  }) as typeof fetch;
  try {
    await persistSnapshot(f.env, "p1", day);
    await persistSnapshot(f.env, "p1", day);
    const report = await analyticsReport(f.env, "p1", 365);
    expect(report.days).toBe(30);
    expect(report.views).toBe(40);
    expect(report.clicks).toBe(20);
    expect(report.clicksPer100Views).toBe(50);
    expect(report.sampled).toBe(true);
    expect(
      queries.every(
        (sql) =>
          sql.includes("SUM(_sample_interval * double1)") &&
          sql.includes("index1='account'") &&
          sql.includes("blob1='p1'"),
      ),
    ).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});
test("external scan quota is account-wide, exact and cached across blogs", async () => {
  const f = fixture();
  seed(f);
  f.sql.run(
    "INSERT INTO posts(id,project_id,title,slug,status,author_id,created_at,updated_at) VALUES('event-post-2','p2','Second blog','second','published','owner',?,?)",
    [f.now, f.now],
  );
  let calls = 0;
  (f.env as any).LINK_SCANNER = {
    fetch: async () => {
      calls++;
      return Response.json({
        status: "inconclusive",
        httpStatus: 403,
        finalUrl: "https://destination.example/path",
      });
    },
  };
  for (const [id, project] of [
    ["a", "p1"],
    ["b", "p1"],
    ["c", "p2"],
  ])
    f.sql.run(
      "INSERT INTO post_links(id,project_id,post_id,url,anchor,kind) VALUES(?,?,?,'https://destination.example/path','Read','external')",
      [id, project, project === "p1" ? "event-post" : "event-post-2"],
    );
  let id = await startLinkScan(f.env, "p1");
  await processLinkScan(f.env, id);
  f.sql.run("UPDATE external_link_cache SET checked_at=?", [f.now - 3600]);
  id = await startLinkScan(f.env, "p2");
  await processLinkScan(f.env, id);
  expect(calls).toBe(1);
  expect(
    (await usage(f.env, await accountAccess(f.env, "account"))).links,
  ).toBe(1);
  expect(
    (f.sql.query("SELECT checked_at FROM post_links WHERE id='c'").get() as any)
      .checked_at,
  ).toBe(f.now - 3600);
  f.sql.run(
    "UPDATE account_billing SET plan='solo' WHERE account_id='account'",
  );
  const a = await accountAccess(f.env, "account");
  await reserveUsage(f.env, a, "fill", "links", 98);
  await settleUsage(f.env, "fill", 98);
  f.sql.run("DELETE FROM external_link_cache");
  f.sql.run("UPDATE post_links SET checked_at=NULL");
  f.sql.run(
    "INSERT INTO post_links(id,project_id,post_id,url,anchor,kind) VALUES('d','p1','event-post','https://another.example','Other','external')",
  );
  id = await startLinkScan(f.env, "p1");
  await processLinkScan(f.env, id);
  expect((await usage(f.env, a)).links).toBe(100);
  expect(
    (f.sql.query("SELECT status FROM link_checks WHERE id=?").get(id) as any)
      .status,
  ).toBe("partial");
  expect(calls).toBe(2);
});

test("link jobs continue within the Free D1 query budget until every destination is checked", async () => {
  const f = fixture();
  seed(f);
  let scanned = 0;
  (f.env as any).LINK_SCANNER = { fetch: async () => {
    scanned++;
    return Response.json({status:"healthy",httpStatus:200,finalUrl:null});
  }};
  for (let index = 0; index < 10; index++)
    f.sql.run("INSERT INTO post_links(id,project_id,post_id,url,anchor,kind) VALUES(?,'p1','event-post',?,'Read','external')",["batch-"+index,"https://destination.example/"+index]);
  const id = await startLinkScan(f.env,"p1");
  let queries = 0, continuations = 0;
  const prepare = f.env.MAIN_DB.prepare.bind(f.env.MAIN_DB);
  f.env.MAIN_DB.prepare = (sql: string) => { queries++; return prepare(sql); };
  for (let attempt = 0; attempt < 10; attempt++) {
    queries = 0;
    f.sql.run("UPDATE background_jobs SET available_at=unixepoch() WHERE id=?",["links:"+id]);
    await processJob(f.env,"links:"+id);
    expect(queries).toBeLessThanOrEqual(50);
    const job = f.sql.query("SELECT status FROM background_jobs WHERE id=?").get("links:"+id) as any;
    if (job.status === "complete") break;
    expect(job.status).toBe("pending");
    continuations++;
  }
  expect(continuations).toBeGreaterThan(0);
  expect(scanned).toBe(10);
  expect(f.sql.query("SELECT status,checked FROM link_checks WHERE id=?").get(id)).toEqual({status:"complete",checked:10});
  expect((await usage(f.env,await accountAccess(f.env,"account"))).links).toBe(10);
});

test("large link inventories paginate without gaps and status filters retain the full orphan report", async () => {
  const f = fixture();
  seed(f);
  f.sql.run(
    "INSERT INTO posts(id,project_id,title,slug,status,author_id,created_at,updated_at) VALUES('target','p1','Target article','target','published','owner',?,?)",
    [f.now, f.now],
  );
  for (let i = 0; i < 205; i++)
    f.sql.run(
      "INSERT INTO post_links(id,project_id,post_id,url,anchor,kind,status) VALUES(?,'p1','event-post',?,'Read','external',?)",
      [
        String(i).padStart(4, "0"),
        "https://external.example/" + i,
        i % 2 ? "broken" : "healthy",
      ],
    );
  f.sql.run(
    "INSERT INTO post_links(id,project_id,post_id,url,anchor,kind) VALUES('local','p1','event-post','https://example.com/blog/target/?campaign=private#heading','Target','internal')",
  );
  const first = await linkReport(f.env, "p1"),
    second = await linkReport(f.env, "p1", { cursor: first.nextCursor! }),
    third = await linkReport(f.env, "p1", { cursor: second.nextCursor! });
  const all = [...first.links, ...second.links, ...third.links];
  expect(first.links).toHaveLength(100);
  expect(second.links).toHaveLength(100);
  expect(third.links).toHaveLength(6);
  expect(third.nextCursor).toBeNull();
  expect(new Set(all.map((link) => link.id)).size).toBe(206);
  expect(all.find((link) => link.id === "local")).toMatchObject({
    status: "healthy",
    httpStatus: 200,
  });
  expect(first.orphaned.map((post: any) => post.id)).not.toContain("target");
  const broken = await linkReport(f.env, "p1", {
    status: "broken",
    limit: 200,
  });
  expect(broken.links).toHaveLength(102);
  expect(broken.links.every((link: any) => link.status === "broken")).toBe(
    true,
  );
  expect(broken.orphaned).toEqual(first.orphaned);
});
