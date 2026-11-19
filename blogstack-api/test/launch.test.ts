import { describe, test, expect } from "bun:test";
import {
  PLANS,
  aiCredits,
  articleJsonLd,
  publicationMetadata,
  analyzeSeo,
} from "@blogstack/core";
import { app } from "../src/index.js";
import {
  accountAccess,
  reserveUsage,
  settleUsage,
  usage,
  usagePeriod,
} from "../src/lib/entitlements.js";
import { createAgentRun, executeAgent } from "../src/lib/agents.js";
import {
  indexPostLinks,
  linkReport,
  processLinkScan,
  startLinkScan,
} from "../src/lib/links.js";
import { runLifecycle } from "../src/lib/lifecycle.js";
import { paidCoverage } from "../src/lib/polar.js";
import { fixture } from "./support.js";

type F = ReturnType<typeof fixture>;
async function request(
  f: F,
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
        "content-type": "application/json",
        origin: f.env.FRONTEND_URL,
        ...(cookie ? { cookie } : {}),
        ...(key ? { "x-api-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    f.env,
    f.ctx,
  );
}
function paid(f: F, plan: keyof typeof PLANS = "solo") {
  f.sql.run(
    "UPDATE account_billing SET plan=?,trial_ends_at=?,paid_through=?,period_anchor=?,interval='year' WHERE account_id='account'",
    [plan, f.now - 1, f.now + 366 * 86400, f.now],
  );
}
async function post(f: F, title = "Original") {
  const key = await f.key();
  const res = await request(
    f,
    "/projects/p1/posts",
    "POST",
    { title },
    undefined,
    key,
  );
  expect(res.status).toBe(201);
  return { key, ...(await res.json()) };
}
const content = JSON.stringify([
  { type: "paragraph", content: [{ type: "text", text: "Public body" }] },
]);

describe("launch entitlements", () => {
  test("canonical catalog matches SQL, legacy labels grant nothing, and joining does not start a trial", async () => {
    const f = fixture();
    for (const [id, p] of Object.entries(PLANS)) {
      expect(
        f.sql
          .query(
            "SELECT max_blogs,max_people,storage_bytes,ai_credits,link_checks,analytics_days FROM launch_plans WHERE id=?",
          )
          .get(id),
      ).toEqual({
        max_blogs: p.maxProjects,
        max_people: p.maxAccountMembers,
        storage_bytes: p.storageBytes,
        ai_credits: p.aiCredits,
        link_checks: p.linkChecks,
        analytics_days: p.analyticsDays,
      });
    }
    f.sql.run(
      "INSERT INTO accounts(id,owner_id,plan,created_at) VALUES('other-account','other','team',1)",
    );
    expect((await accountAccess(f.env, "other-account")).writable).toBe(0);
    f.sql.run(
      "INSERT INTO project_members(project_id,user_id,role,invited_by,invited_at,joined_at) VALUES('p1','other','writer','owner',1,?)",
      [f.now],
    );
    expect(
      (await accountAccess(f.env, "other-account")).trial_started_at,
    ).toBeNull();
    f.sql.run(
      "UPDATE account_billing SET trial_ends_at=? WHERE account_id='account'",
      [f.now - 1],
    );
    f.sql.run("UPDATE accounts SET plan='team' WHERE id='account'");
    expect((await accountAccess(f.env, "account")).writable).toBe(0);
  });
  test("real signed sessions select accounts and owner-only billing blocks project keys", async () => {
    const f = fixture(),
      cookie = await f.session();
    const me = await request(f, "/accounts/me", "GET", undefined, cookie);
    expect(me.status).toBe(200);
    expect((await me.json()).id).toBe("account");
    const key = await f.key();
    expect(
      (
        await request(
          f,
          "/accounts/account/billing",
          "GET",
          undefined,
          undefined,
          key,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request(f, "/accounts/account/billing", "GET", undefined, cookie))
        .status,
    ).toBe(200);
    const other = await f.session("other");
    expect(
      (await request(f, "/accounts/account/billing", "GET", undefined, other))
        .status,
    ).toBe(403);
  });
  test("Solo rejects additional blogs, both unlimited plans accept more than five", async () => {
    const f = fixture();
    f.sql.run("DELETE FROM projects WHERE id='p2'");
    paid(f);
    const cookie = await f.session();
    expect(
      (await request(f, "/projects", "POST", { name: "Second" }, cookie))
        .status,
    ).toBe(409);
    for (const plan of ["studio", "growth"] as const) {
      paid(f, plan);
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          request(f, "/projects", "POST", { name: plan + "-" + i }, cookie),
        ),
      );
      expect(responses.every((r) => r.status === 201)).toBe(true);
    }
    expect(
      (f.sql.query("SELECT COUNT(*) n FROM projects").get() as any).n,
    ).toBe(25);
    await expect(
      f.env.MAIN_DB.prepare(
        "UPDATE account_billing SET pending_plan='solo' WHERE account_id='account'",
      ).run(),
    ).rejects.toThrow("BLOG_LIMIT");
  });
  test("people are unique across blogs and pending invitations reserve shared seats", () => {
    const f = fixture();
    paid(f);
    f.sql.run(
      "INSERT INTO project_members(project_id,user_id,role,invited_by,invited_at,joined_at) VALUES('p1','writer','writer','owner',1,1),('p2','writer','writer','owner',1,1)",
    );
    expect(
      (
        f.sql
          .query(
            "SELECT COUNT(*) n FROM account_people WHERE account_id='account'",
          )
          .get() as any
      ).n,
    ).toBe(2);
    expect(() =>
      f.sql.run(
        "INSERT INTO invitations(id,project_id,email,role,token,invited_by,expires_at) VALUES('i','p1','other@example.com','writer','tok','owner',?)",
        [f.now + 100],
      ),
    ).toThrow("PEOPLE_LIMIT");
  });
  test("concurrent reservations cannot exceed shared credits; settlement refunds once", async () => {
    const f = fixture();
    paid(f);
    const a = await accountAccess(f.env, "account");
    const reservations = await Promise.allSettled([
      reserveUsage(f.env, a, "r1", "ai", 8),
      reserveUsage(f.env, a, "r2", "ai", 8),
    ]);
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
    expect((await usage(f.env, a)).ai).toBe(8);
    await settleUsage(f.env, "r1", 1);
    await settleUsage(f.env, "r1", 0);
    expect((await usage(f.env, a)).ai).toBe(1);
    expect(aiCredits(4001, 999)).toBe(2);
    expect(aiCredits(4000, 1001)).toBe(2);
    const annual = { ...a, period_anchor: Date.UTC(2026, 0, 31) / 1000 };
    expect(usagePeriod(annual, Date.UTC(2026, 2, 1) / 1000)).toBe(
      Date.UTC(2026, 1, 28) / 1000,
    );
  });
  test("upload reservations share the 100 GB ceiling and rejected uploads reserve nothing", async () => {
    const f = fixture();
    paid(f, "growth");
    f.sql.run(
      "INSERT INTO media(id,project_id,key,url,filename,mime_type,confirmed,reserved_size,size,uploaded_by,created_at) VALUES('existing','p1','k','https://example.com/k','image.png','image/png',1,1,99999999900,'owner',1)",
    );
    const key = await f.key();
    const responses = await Promise.all([
      request(
        f,
        "/projects/p1/media/presign",
        "POST",
        { filename: "a.png", mimeType: "image/png", size: 75 },
        undefined,
        key,
      ),
      request(
        f,
        "/projects/p2/media/presign",
        "POST",
        { filename: "b.png", mimeType: "image/png", size: 75 },
        undefined,
        await f.key("p2"),
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        f.sql
          .query("SELECT COUNT(*) n FROM media WHERE confirmed=0")
          .get() as any
      ).n,
    ).toBe(1);
  });
});

describe("safe publication and analysis", () => {
  test("new blogs opt in to reader tracking without changing existing blogs", async () => {
    const f = fixture();
    const cookie = await f.session();
    const created = await request(
      f,
      "/projects",
      "POST",
      { name: "New blog", settings: { blogUrl: "https://example.com/journal" } },
      cookie,
    );
    expect(created.status).toBe(201);
    const project = await created.json();
    expect(project.settings).toEqual({
      blogUrl: "https://example.com/journal",
      analyticsEnabled: false,
    });
    const publicInfo = () => request(f, "/public/" + project.slug);
    expect((await (await publicInfo()).json()).analyticsEnabled).toBe(false);

    const enabled = await request(
      f,
      "/projects/" + project.id,
      "PATCH",
      { settings: { analyticsEnabled: true } },
      cookie,
    );
    expect(enabled.status).toBe(200);
    expect((await (await publicInfo()).json()).analyticsEnabled).toBe(true);
    expect((await (await request(f, "/public/p1")).json()).analyticsEnabled).toBe(true);
  });

  test("private autosaves preserve live snapshots, stale revisions fail, invalid rendering cannot replace live content", async () => {
    const f = fixture(),
      p = await post(f);
    const path = "/projects/p1/posts/" + p.id;
    const saved = await (
      await request(
        f,
        path,
        "PATCH",
        {
          content,
          revision: 1,
          seoDescription: "A public description",
          excerpt: "Summary",
        },
        undefined,
        p.key,
      )
    ).json();
    expect(saved.revision).toBe(2);
    expect(
      (
        await request(
          f,
          path + "/publish",
          "POST",
          { revision: 2 },
          undefined,
          p.key,
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await request(f, "/public/p1/posts/original")).json())
        .renderedHtml,
    ).toContain("Public body");
    expect(
      (
        await request(
          f,
          path,
          "PATCH",
          { title: "Private edit", revision: 2 },
          undefined,
          p.key,
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await request(f, "/public/p1/posts/original")).json()).title,
    ).toBe("Original");
    expect(
      (
        await request(
          f,
          path + "/publish",
          "POST",
          { revision: 2 },
          undefined,
          p.key,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          f,
          path,
          "PATCH",
          { content: '[{"type":"unsupported"}]', revision: 3 },
          undefined,
          p.key,
        )
      ).status,
    ).toBe(400);
    expect(
      (await (await request(f, "/public/p1/posts/original")).json()).title,
    ).toBe("Original");
    const preview = await request(
      f,
      path + "/preview",
      "GET",
      undefined,
      undefined,
      p.key,
    );
    expect(preview.headers.get("x-robots-tag")).toContain("noindex");
  });
  test("SEO findings are deterministic and no-index articles are absent from sitemap", async () => {
    const f = fixture(),
      p = await post(f);
    const key = await f.key("p1", ["posts:read", "posts:write", "seo:read"]);
    const seo = await (
      await request(
        f,
        "/projects/p1/seo?postId=" + p.id,
        "GET",
        undefined,
        undefined,
        key,
      )
    ).json();
    expect(seo.issues.some((i: any) => i.code === "missing_description")).toBe(
      true,
    );
    await request(
      f,
      "/projects/p1/posts/" + p.id,
      "PATCH",
      {
        revision: 1,
        noIndex: true,
        canonicalUrl: "https://publisher.example/article",
      },
      undefined,
      key,
    );
    await request(
      f,
      "/projects/p1/posts/" + p.id + "/publish",
      "POST",
      { revision: 2 },
      undefined,
      key,
    );
    const sitemap = await (await request(f, "/public/p1/sitemap.xml")).text();
    expect(sitemap).not.toContain("/original");
    const metadata = publicationMetadata(
      { title: "Example", slug: "x", publishedAt: f.now, noIndex: true },
      "https://example.com/blog",
    );
    expect(metadata.robots.index).toBe(false);
    expect(
      articleJsonLd(
        { title: "</script>", slug: "x", publishedAt: f.now },
        "https://example.com/blog",
      ),
    ).not.toContain("</script>");
  });
  test("local article health consumes no external quota and responds to unpublishing", async () => {
    const f = fixture();
    const target = await post(f, "Target"),
      source = await post(f, "Source");
    const longSlug =
      "an-article-with-a-slug-longer-than-d1s-like-pattern-limit-for-real-publications";
    await request(
      f,
      "/projects/p1/posts/" + target.id,
      "PATCH",
      { revision: 1, slug: longSlug },
      undefined,
      target.key,
    );
    await request(
      f,
      "/projects/p1/posts/" + target.id + "/publish",
      "POST",
      undefined,
      undefined,
      target.key,
    );
    const linked = JSON.stringify([
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            href: "/blog/" + longSlug + "?ref=article#section",
            content: [{ type: "text", text: "Target" }],
          },
        ],
      },
    ]);
    await request(
      f,
      "/projects/p1/posts/" + source.id,
      "PATCH",
      { revision: 1, content: linked },
      undefined,
      source.key,
    );
    await request(
      f,
      "/projects/p1/posts/" + source.id + "/publish",
      "POST",
      { revision: 2 },
      undefined,
      source.key,
    );
    await indexPostLinks(
      f.env,
      f.sql.query("SELECT * FROM posts WHERE id=?").get(source.id) as any,
    );
    expect((await linkReport(f.env, "p1")).links[0]!.status).toBe("healthy");
    await request(
      f,
      "/projects/p1/posts/" + target.id + "/unpublish",
      "POST",
      undefined,
      undefined,
      target.key,
    );
    expect(
      (
        f.sql
          .query("SELECT status FROM post_links WHERE post_id=?")
          .get(source.id) as { status: string }
      ).status,
    ).toBe("broken");
    expect((await linkReport(f.env, "p1")).links[0]!.status).toBe("broken");
    expect(
      (await usage(f.env, await accountAccess(f.env, "account"))).links,
    ).toBe(0);
  });
  test("expiry stops editing, delivery pauses after 30 days, exports last until 90 days, media cleanup persists", async () => {
    const f = fixture(),
      p = await post(f);
    await request(
      f,
      "/projects/p1/posts/" + p.id + "/publish",
      "POST",
      undefined,
      undefined,
      p.key,
    );
    f.sql.run(
      "UPDATE account_billing SET trial_ends_at=? WHERE account_id='account'",
      [f.now - 86400],
    );
    expect(
      (
        await request(
          f,
          "/projects/p1/posts/" + p.id,
          "PATCH",
          { revision: 1, title: "No" },
          undefined,
          p.key,
        )
      ).status,
    ).toBe(402);
    expect((await request(f, "/public/p1/posts/original")).status).toBe(200);
    const cookie = await f.session();
    expect(
      (await request(f, "/projects/p1/export", "GET", undefined, cookie))
        .status,
    ).toBe(200);
    f.sql.run(
      "UPDATE account_billing SET trial_ends_at=? WHERE account_id='account'",
      [f.now - 31 * 86400],
    );
    expect((await request(f, "/public/p1/posts/original")).status).toBe(410);
    expect(
      (await request(f, "/projects/p1/export", "GET", undefined, cookie))
        .status,
    ).toBe(200);
    f.sql.run(
      "UPDATE account_billing SET trial_ends_at=? WHERE account_id='account'",
      [f.now - 91 * 86400],
    );
    expect(
      (await request(f, "/projects/p1/export", "GET", undefined, cookie))
        .status,
    ).toBe(410);
    await runLifecycle(f.env);
    expect(
      (f.sql.query("SELECT COUNT(*) n FROM projects").get() as any).n,
    ).toBe(0);
    const notices = f.sql
      .query("SELECT COUNT(*) n FROM lifecycle_notices")
      .get();
    f.sql.run("DELETE FROM background_jobs WHERE kind='email'");
    await runLifecycle(f.env);
    expect(
      f.sql.query("SELECT COUNT(*) n FROM lifecycle_notices").get(),
    ).toEqual(notices);
    expect(
      (
        f.sql
          .query("SELECT COUNT(*) n FROM background_jobs WHERE kind='email'")
          .get() as any
      ).n,
    ).toBe(0);
  });
});

describe("agents require human review", () => {
  test("proposals save a draft only, cannot be accepted by keys, and cannot overwrite stale revisions", async () => {
    const f = fixture(),
      p = await post(f);
    (f.env as any).AI = {
      run: async () => ({
        response: JSON.stringify({
          summary: "Shorter title",
          changes: { title: "Proposed title" },
        }),
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
    };
    const id = await createAgentRun(f.env, "p1", "owner", {
      postId: p.id,
      profile: "writing",
      prompt: "Improve the title",
    });
    await executeAgent(f.env, id);
    expect(
      f.sql
        .query("SELECT status,credits FROM agent_runs WHERE id=?")
        .get(id) as any,
    ).toEqual({ status: "complete", credits: 1 });
    const proposal = f.sql
      .query("SELECT id FROM agent_proposals WHERE run_id=?")
      .get(id) as any;
    const url =
      "/projects/p1/agent-runs/" + id + "/proposals/" + proposal.id + "/review";
    const key = await f.key("p1", ["agent-runs:write"]);
    expect(
      (await request(f, url, "POST", { action: "accept" }, undefined, key))
        .status,
    ).toBe(403);
    const cookie = await f.session();
    expect(
      (await request(f, url, "POST", { action: "accept" }, cookie)).status,
    ).toBe(200);
    expect(
      f.sql.query("SELECT status,title FROM posts WHERE id=?").get(p.id),
    ).toEqual({ status: "draft", title: "Original" });
    expect(
      (
        f.sql
          .query("SELECT title FROM post_drafts WHERE post_id=?")
          .get(p.id) as any
      ).title,
    ).toBe("Proposed title");
    expect(
      (await request(f, url, "POST", { action: "accept" }, cookie)).status,
    ).toBe(409);
    const second = await createAgentRun(f.env, "p1", "owner", {
      postId: p.id,
      profile: "seo",
      prompt: "Improve metadata",
    });
    await executeAgent(f.env, second);
    const newer = f.sql
      .query("SELECT id FROM agent_proposals WHERE run_id=?")
      .get(second) as any;
    await request(
      f,
      "/projects/p1/posts/" + p.id,
      "PATCH",
      { revision: 2, title: "Newer human draft" },
      undefined,
      p.key,
    );
    expect(
      (
        await request(
          f,
          "/projects/p1/agent-runs/" +
            second +
            "/proposals/" +
            newer.id +
            "/review",
          "POST",
          { action: "accept" },
          cookie,
        )
      ).status,
    ).toBe(409);
  });
  test("unavailable tools and revoked roles fail without publishing or charging", async () => {
    const f = fixture(),
      p = await post(f);
    (f.env as any).AI = {
      run: async () => ({
        tool_calls: [{ name: "publish", arguments: {} }],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      }),
    };
    const id = await createAgentRun(f.env, "p1", "owner", {
      postId: p.id,
      profile: "linking",
      prompt: "Publish this",
    });
    await executeAgent(f.env, id);
    expect(
      (f.sql.query("SELECT status FROM agent_runs WHERE id=?").get(id) as any)
        .status,
    ).toBe("failed");
    expect((await usage(f.env, await accountAccess(f.env, "account"))).ai).toBe(
      0,
    );
    expect(
      (f.sql.query("SELECT status FROM posts WHERE id=?").get(p.id) as any)
        .status,
    ).toBe("draft");
  });
  test("paid coverage comes from paid order items, never an advanced unpaid renewal", () => {
    const base = {
      paid: true,
      status: "paid",
      items: [
        {
          amount: 300,
          start_timestamp: "2026-01-01T00:00:00Z",
          end_timestamp: "2026-02-01T00:00:00Z",
        },
      ],
    };
    expect(paidCoverage(base as any)).toEqual({
      start: 1767225600,
      end: 1769904000,
    });
    expect(paidCoverage({ ...base, paid: false } as any)).toBeNull();
    expect(paidCoverage({ ...base, status: "refunded" } as any)).toBeNull();
    expect(paidCoverage({ ...base, items: [] } as any)).toBeNull();
  });
});

test("agent read tools cannot cross projects and include the assistant/tool exchange", async () => {
  const f = fixture(),
    p = await post(f);
  f.sql.run(
    "INSERT INTO posts(id,project_id,title,slug,content,status,author_id,created_at,updated_at) VALUES('private-other','p2','Other project','other','[]','published','owner',1,1)",
  );
  let calls = 0;
  (f.env as any).AI = {
    run: async (_model: string, options: any) => {
      calls++;
      if (calls === 1)
        return {
          tool_calls: [
            { name: "read_post", arguments: { post_id: "private-other" } },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        };
      expect(options.messages.at(-2).role).toBe("assistant");
      expect(options.messages.at(-1).role).toBe("tool");
      expect(JSON.parse(options.messages.at(-1).content).result).toBeNull();
      return {
        response: JSON.stringify({
          summary: "Authorized draft only",
          changes: { seoTitle: "Clear title" },
        }),
        usage: { prompt_tokens: 200, completion_tokens: 30 },
      };
    },
  };
  const id = await createAgentRun(f.env, "p1", "owner", {
    postId: p.id,
    profile: "seo",
    prompt: "Improve SEO",
  });
  await executeAgent(f.env, id);
  expect(calls).toBe(2);
  expect(
    f.sql
      .query("SELECT status,credits FROM agent_runs WHERE id=?")
      .get(id) as any,
  ).toEqual({ status: "complete", credits: 1 });
});

test("Workers AI structured proposals preserve the selected post ID and validate the final response schema", async () => {
  const f = fixture(),
    p = await post(f);
  let calls = 0;
  (f.env as any).AI = {
    run: async (_model: string, options: any) => {
      calls++;
      expect(
        JSON.parse(options.messages[1].content.split("Selected draft: ")[1])
          .postId,
      ).toBe(p.id);
      if (calls < 4)
        return {
          tool_calls: [{ name: "read_post", arguments: { post_id: p.id } }],
          usage: { prompt_tokens: 200, completion_tokens: 20 },
        };
      expect(options.tools).toBeUndefined();
      expect(options.response_format.type).toBe("json_schema");
      expect(
        options.response_format.json_schema.properties.changes,
      ).toBeDefined();
      return {
        response: {
          summary: "A concise search preview",
          changes: { seoDescription: "A reviewable description." },
        },
        usage: { prompt_tokens: 300, completion_tokens: 30 },
      };
    },
  };
  const id = await createAgentRun(f.env, "p1", "owner", {
    postId: p.id,
    profile: "seo",
    prompt: "Improve the search description",
  });
  await executeAgent(f.env, id);
  expect(calls).toBe(4);
  expect(
    f.sql.query("SELECT status,credits FROM agent_runs WHERE id=?").get(id),
  ).toEqual({ status: "complete", credits: 1 });
  const proposal = f.sql
    .query("SELECT changes FROM agent_proposals WHERE run_id=?")
    .get(id) as any;
  expect(JSON.parse(proposal.changes)).toEqual({
    seoDescription: "A reviewable description.",
  });
  expect(
    f.sql
      .query("SELECT seo_description FROM post_drafts WHERE post_id=?")
      .get(p.id),
  ).toEqual({ seo_description: null });
});

test("revocation during a model request prevents subsequent tools and draft proposals", async () => {
  const f = fixture();
  f.sql.run(
    "INSERT INTO project_members(project_id,user_id,role,invited_by,invited_at,joined_at) VALUES('p1','writer','writer','owner',1,1)",
  );
  const key = await f.key("p1", ["posts:write"], "writer");
  const response = await request(
      f,
      "/projects/p1/posts",
      "POST",
      { title: "Writer draft" },
      undefined,
      key,
    ),
    p = await response.json();
  let calls = 0;
  (f.env as any).AI = {
    run: async () => {
      calls++;
      f.sql.run("DELETE FROM project_members WHERE user_id='writer'");
      return {
        tool_calls: [{ name: "read_post", arguments: { post_id: p.id } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      };
    },
  };
  const id = await createAgentRun(f.env, "p1", "writer", {
    postId: p.id,
    profile: "writing",
    prompt: "Improve",
  });
  await executeAgent(f.env, id);
  expect(calls).toBe(1);
  expect(
    (f.sql.query("SELECT status FROM agent_runs WHERE id=?").get(id) as any)
      .status,
  ).toBe("failed");
  expect(
    (
      f.sql
        .query("SELECT COUNT(*) n FROM agent_proposals WHERE run_id=?")
        .get(id) as any
    ).n,
  ).toBe(0);
  expect((await usage(f.env, await accountAccess(f.env, "account"))).ai).toBe(
    0,
  );
});

test("pilot signup and production billing fail closed before external launch readiness", async () => {
  const f = fixture();
  f.env.SIGNUP_MODE = "pilot";
  const signup = await request(f, "/api/auth/sign-up/email", "POST", {
    name: "Uninvited",
    email: "uninvited@example.com",
    password: "Uninvited-local-test!",
  });
  expect(signup.status).toBe(403);
  expect(
    f.sql
      .query("SELECT id FROM users WHERE email='uninvited@example.com'")
      .get(),
  ).toBeNull();
  const { billingReady, checkout } = await import("../src/lib/polar.js");
  Object.assign(f.env, {
    POLAR_SERVER: "production",
    POLAR_ACCESS_TOKEN: "provided-but-incomplete",
  });
  expect(billingReady(f.env)).toBe(false);
  await expect(checkout(f.env, "account", "studio", "month")).rejects.toThrow(
    "Paid subscriptions are not available yet",
  );
});
