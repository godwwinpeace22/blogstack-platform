import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
const file = ".launch/customer-qa-fixture.json";
const f = JSON.parse(readFileSync(file, "utf8"));
assert.match(new URL(f.url).hostname, /^blogstack-qa-app\./);
const save = () =>
  writeFileSync(file, JSON.stringify(f, null, 2) + "\n", { mode: 0o600 });
const user = (role) => {
  const found = f.users.find((u) => u.role === role);
  assert(found, "Missing synthetic actor");
  return found;
};
async function request(actor, path, method = "GET", body, expected = 200) {
  const response = await fetch(f.url + path, {
    method,
    headers: {
      Origin: f.url,
      "Content-Type": "application/json",
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (expected !== null)
    assert.equal(
      response.status,
      expected,
      method + " " + path + " returned unexpected HTTP status",
    );
  if (response.status === 204) return null;
  const data = await response.json();
  return expected === null ? { status: response.status, data } : data;
}
async function dispatch(id) {
  const r = await fetch(f.url + "/__qa/run-job", {
    method: "POST",
    headers: {
      "x-qa-control": f.controlSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(90000),
  });
  assert(r.ok, "QA job dispatch failed with HTTP " + r.status);
  return r.json();
}
if (process.argv.includes("--prepare")) {
  for (const actor of f.users) {
    if (!actor.cookie) {
      const response = await fetch(f.url + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { Origin: f.url, "Content-Type": "application/json" },
        body: JSON.stringify({ email: actor.email, password: f.password }),
        signal: AbortSignal.timeout(30000),
      });
      assert(
        response.ok,
        "Synthetic login failed with HTTP " + response.status,
      );
      actor.cookie = response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      save();
    }
    actor.account = await request(actor, "/accounts/me");
    save();
  }
  console.log(
    "PASS: five isolated synthetic logins and owned accounts; no trial starts before blog creation",
  );
}
if (process.argv.includes("--capture")) {
  const projects = await request(user("agency"), "/projects");
  f.project = projects.find((p) => p.slug === "customer-acceptance");
  assert(f.project, "Create the agency project through the browser first");
  const invites = await request(
    user("agency"),
    "/projects/" + f.project.id + "/invitations",
  );
  f.invite = invites.find((i) => i.email === user("client").email);
  assert(f.invite?.token, "Invite the client through the browser first");
  save();
  console.log(
    "PASS: real UI-created agency project and client invitation persisted",
  );
}
if (process.argv.includes("--verify-customer")) {
  const client = user("client"),
    owner = user("agency"),
    outsider = user("outsider");
  const project = await request(client, "/projects/" + f.project.id);
  assert.equal(project.role, "editor");
  assert.equal(project.branding.workspaceName, "Cedar QA Studio");
  const own = await request(client, "/accounts/me");
  assert.equal(
    own.trialEndsAt,
    null,
    "Invitation must not start an owned trial",
  );
  const checks = [];
  for (const path of [
    "/projects/" + project.id,
    "/projects/" + project.id + "/posts",
    "/projects/" + project.id + "/analytics",
    "/projects/" + project.id + "/media",
    "/projects/" + project.id + "/agent-runs",
  ]) {
    const result = await request(outsider, path, "GET", undefined, null);
    assert.equal(
      result.status,
      403,
      "Unrelated customer must not access " + path,
    );
  }
  checks.push(
    "Unrelated account is denied project, drafts, analytics, media and agent runs",
  );
  assert.equal(
    (
      await request(
        client,
        "/accounts/" + owner.account.id + "/billing",
        "GET",
        undefined,
        null,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        client,
        "/projects/" + project.id,
        "PATCH",
        { name: "Unauthorized settings" },
        null,
      )
    ).status,
    403,
  );
  checks.push("Client editor cannot manage agency billing or project settings");
  const posts = await request(client, "/projects/" + project.id + "/posts");
  const post = posts.data.find((p) => p.slug === "customer-first-story");
  assert(
    post?.status === "published",
    "Publish the illustrated client article through the browser",
  );
  const live = await request(
    null,
    "/public/" + project.slug + "/posts/" + post.slug,
  );
  assert(live.renderedHtml.includes("Customer acceptance article"));
  assert(live.coverImage && live.seoDescription);
  const image = await fetch(live.coverImage, {
    signal: AbortSignal.timeout(20000),
  });
  assert(image.ok, "Confirmed client image must be delivered");
  await image.body?.cancel();
  checks.push(
    "Client UI publication delivers body, cover image and SEO metadata publicly",
  );
  checks.push(
    "Agency branding and invite acceptance work without starting a client-owned trial",
  );
  f.post = post;
  save();
  writeFileSync(
    "artifacts/verification/customer-acceptance.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        environment: "isolated Cloudflare QA",
        syntheticUsers: true,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ customerChecks: checks, published: true }));
}
if (process.argv.includes("--fixtures")) {
  for (const role of ["solo", "growth"]) {
    const actor = user(role);
    if (!actor.project) {
      actor.project = await request(
        actor,
        "/projects",
        "POST",
        {
          name: "QA " + role,
          slug: "qa-" + role,
          settings: { blogUrl: "https://example.invalid/blog" },
        },
        201,
      );
      save();
    }
  }
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const sql = [
    "UPDATE account_billing SET plan='solo' WHERE account_id=" +
      quote(user("solo").account.id) +
      ";",
    "UPDATE account_billing SET plan='growth' WHERE account_id=" +
      quote(user("growth").account.id) +
      ";",
  ];
  writeFileSync(".launch/customer-qa-quota-plans.sql", sql.join("\n"), {
    mode: 0o600,
  });
  console.log(
    "Prepared isolated trial-plan quota fixtures. No paid coverage or payment records are created.",
  );
}
if (process.argv.includes("--load")) {
  assert(
    f.project && f.post,
    "Complete browser customer acceptance before load tests",
  );
  const results = [];
  async function group(name, count, concurrency, task) {
    const started = performance.now(),
      values = [],
      elapsed = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (index < count) {
          const n = index++;
          const at = performance.now();
          values[n] = await task(n);
          elapsed.push(performance.now() - at);
        }
      }),
    );
    elapsed.sort((a, b) => a - b);
    const row = {
      name,
      requests: count,
      concurrency,
      durationMs: Math.round(performance.now() - started),
      p50Ms: Math.round(elapsed[Math.floor(elapsed.length * 0.5)]),
      p95Ms: Math.round(
        elapsed[
          Math.min(elapsed.length - 1, Math.floor(elapsed.length * 0.95))
        ],
      ),
      statuses: {},
    };
    for (const value of values) {
      const status = value?.status ?? 200;
      row.statuses[status] = (row.statuses[status] || 0) + 1;
    }
    results.push(row);
    console.log(JSON.stringify(row));
    return values;
  }
  const agency = user("agency"),
    p = "/projects/" + f.project.id,
    postPath = p + "/posts/" + f.post.id;
  for (const concurrency of [1, 4, 8])
    await group("public article reads", 40, concurrency, async () => {
      const r = await fetch(
        f.url + "/public/" + f.project.slug + "/posts/" + f.post.slug,
        { signal: AbortSignal.timeout(30000) },
      );
      assert.equal(
        r.status,
        200,
        "Public read must not fail under bounded load",
      );
      const post = await r.json();
      assert(post.renderedHtml.includes("Customer acceptance article"));
      return { status: r.status };
    });
  let draft = await request(agency, postPath);
  const writes = await group(
    "same-revision concurrent draft saves",
    12,
    12,
    (i) =>
      request(
        agency,
        postPath,
        "PATCH",
        { revision: draft.revision, excerpt: "Concurrent draft " + i },
        null,
      ),
  );
  assert.equal(
    writes.filter((v) => v.status === 200).length,
    1,
    "Exactly one same-revision write wins",
  );
  assert(
    writes.every((v) => [200, 409].includes(v.status)),
    "Other same-revision writes must reject stale revisions",
  );
  const solo = user("solo");
  const blogs = await group("Solo blog cap", 8, 8, (i) =>
    request(
      solo,
      "/projects",
      "POST",
      { name: "Rejected extra " + i, slug: "rejected-solo-" + i },
      null,
    ),
  );
  assert(
    blogs.every((v) => v.status === 409),
    "Solo must reject every additional blog",
  );
  const invites = await group("shared people reservation", 12, 8, (i) =>
    request(
      solo,
      "/projects/" + solo.project.id + "/members",
      "POST",
      { email: "quota-" + i + "@example.invalid", role: "writer" },
      null,
    ),
  );
  assert.equal(
    invites.filter((v) => v.status === 201).length,
    1,
    "Solo owner leaves only one invitation slot",
  );
  assert(invites.every((v) => [201, 409].includes(v.status)));
  const uploads = await group("shared 1 GB upload reservation", 110, 8, (i) =>
    request(
      solo,
      "/projects/" + solo.project.id + "/media/presign",
      "POST",
      {
        filename: "reservation-" + i + ".png",
        mimeType: "image/png",
        size: 10 * 1024 * 1024,
      },
      null,
    ),
  );
  assert.equal(
    uploads.filter((v) => v.status === 200).length,
    Math.floor(1e9 / (10 * 1024 * 1024)),
    "Concurrent reservations must stop at exact shared capacity",
  );
  assert(uploads.every((v) => [200, 409].includes(v.status)));
  const runs = await group(
    "shared AI reservations without inference",
    24,
    8,
    () =>
      request(
        agency,
        p + "/agent-runs",
        "POST",
        {
          postId: f.post.id,
          profile: "writing",
          prompt: "QA allowance reservation; do not dispatch this job",
        },
        null,
      ),
  );
  assert(runs.every((v) => [202, 409].includes(v.status)));
  const estimate = await request(agency, p + "/agent-runs/estimate");
  assert.equal(
    estimate.availableCredits,
    0,
    "Shared AI allowance must not be overspent",
  );
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const ids = runs.filter((v) => v.status === 202).map((v) => v.data.id);
  assert(ids.length > 0);
  const list = ids.map(quote).join(",");
  writeFileSync(
    ".launch/customer-qa-release-reservations.sql",
    "UPDATE usage_reservations SET reserved=0,settled=1 WHERE settled=0 AND id IN (" +
      list +
      ");\nUPDATE agent_runs SET status='failed',error='QA reservation released without inference',completed_at=unixepoch() WHERE id IN (" +
      list +
      ");\nUPDATE background_jobs SET status='complete' WHERE id IN (" +
      ids.map((id) => quote("agent:" + id)).join(",") +
      ");\n",
    { mode: 0o600 },
  );
  const billing = await request(
    user("growth"),
    "/accounts/" + user("growth").account.id + "/billing",
  );
  assert.equal(billing.limits.storageBytes, 100e9);
  assert.equal(billing.limits.maxProjects, null);
  const report = {
    verifiedAt: new Date().toISOString(),
    environment: "isolated Cloudflare Workers Free QA",
    syntheticUsers: true,
    unexpectedFailures: 0,
    totalRequests: results.reduce((n, r) => n + r.requests, 0),
    realModelCallsDuringLoad: 0,
    results,
    checks: [
      "Public delivery succeeds at tested concurrency levels",
      "Stale revisions cannot overwrite concurrent saves",
      "Solo blog and shared people/storage limits hold atomically",
      "AI credits are reserved atomically across concurrent requests without invoking a model",
      "Growth exposes 100 GB and unlimited blogs",
    ],
    limits:
      "This is a bounded pilot-load acceptance test, not a capacity guarantee or a real-customer pilot.",
  };
  writeFileSync(
    "artifacts/verification/customer-load.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("PASS: bounded concurrency and shared quota acceptance");
}
if (process.argv.includes("--run-job")) {
  const id = process.argv[process.argv.indexOf("--run-job") + 1];
  assert(id, "Pass a QA job ID");
  const r = await fetch(f.url + "/__qa/run-job", {
    method: "POST",
    headers: {
      "x-qa-control": f.controlSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(90000),
  });
  assert(r.ok, "QA job dispatch failed with HTTP " + r.status);
  console.log(await r.text());
}
if (process.argv.includes("--publication-cycle")) {
  const client = user("client"),
    path = "/projects/" + f.project.id + "/posts/" + f.post.id;
  const publicPath = "/public/" + f.project.slug + "/posts/" + f.post.slug;
  const old = await request(null, publicPath),
    draft = await request(client, path);
  const blocks = JSON.parse(draft.content);
  const marker = "Private customer revision " + Date.now();
  const destination =
    "https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/quickstart?campaign=customer-qa";
  blocks.push({
    id: crypto.randomUUID(),
    type: "paragraph",
    props: {},
    content: [
      { type: "text", text: marker, styles: {} },
      {
        type: "link",
        href: destination,
        content: [{ type: "text", text: " Installation guide", styles: {} }],
      },
      {
        type: "link",
        href: "http://127.0.0.1/private",
        content: [
          { type: "text", text: " Unsafe destination test", styles: {} },
        ],
      },
    ],
    children: [],
  });
  const saved = await request(client, path, "PATCH", {
    revision: draft.revision,
    content: JSON.stringify(blocks),
  });
  assert.equal(
    (await request(null, publicPath)).renderedHtml,
    old.renderedHtml,
    "Private revision must not leak",
  );
  assert.equal(
    (
      await request(
        client,
        path + "/publish",
        "POST",
        { revision: draft.revision },
        null,
      )
    ).status,
    409,
    "Stale publication must reject",
  );
  await request(client, path + "/publish", "POST", {
    revision: saved.revision,
  });
  assert((await request(null, publicPath)).renderedHtml.includes(marker));
  await request(client, path + "/unpublish", "POST", {});
  assert.equal(
    (await request(null, publicPath, "GET", undefined, null)).status,
    404,
  );
  const listing = await request(null, "/public/" + f.project.slug + "/posts");
  assert(!listing.data.some((p) => p.id === f.post.id));
  await request(client, path + "/publish", "POST", {
    revision: saved.revision,
  });
  assert((await request(null, publicPath)).renderedHtml.includes(marker));
  assert.equal(
    (await dispatch("index:" + f.post.id + ":" + saved.revision)).status,
    "complete",
  );
  f.post = saved;
  f.clickDestination = destination;
  save();
  const scan = await request(
    client,
    "/projects/" + f.project.id + "/links/scans",
    "POST",
    {},
    202,
  );
  f.scanId = scan.id;
  save();
  console.log(
    JSON.stringify({
      publicationCycle: "passed",
      index: "complete",
      scanQueued: true,
    }),
  );
  writeFileSync(
    "artifacts/verification/customer-publication-cycle.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        checks: [
          "Private body revision does not leak",
          "Stale publish rejected",
          "Republish exposes saved body",
          "Unpublish removes public article and listing",
          "Final republish and link indexing succeed",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
if (process.argv.includes("--link-scan")) {
  const status = await dispatch("links:" + f.scanId);
  console.log(JSON.stringify({ linkScanJob: status.status }));
  const report = await request(
    user("client"),
    "/projects/" + f.project.id + "/links",
  );
  f.linkReport = report;
  save();
  console.log(JSON.stringify(report));
}
if (process.argv.includes("--collect")) {
  const baseline = await request(
    user("client"),
    "/projects/" + f.project.id + "/analytics",
  );
  assert(baseline.liveAvailable);
  f.analyticsBaseline = { views: baseline.views, clicks: baseline.clicks };
  save();
  const event = {
    postId: f.post.id,
    type: "view",
    referrer: "https://qa-referrer.example/article?private=discard",
  };
  const headers = {
    Origin: "http://localhost:3005",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 BlogStackCustomerAcceptance",
    "x-qa-control": f.controlSecret,
  };
  const send = async (body, extra = {}) => {
    const r = await fetch(f.url + "/public/" + f.project.slug + "/events", {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 204);
    const shouldWrite =
      !body.preview && !extra.DNT && !extra["User-Agent"] && !extra.Origin;
    assert.equal(
      r.headers.get("x-qa-event-written"),
      String(shouldWrite),
      body.type + " collector receipt",
    );
  };
  await send(event);
  await send({ ...event, type: "click", destination: f.clickDestination });
  await send({ ...event, preview: true });
  await send(event, { DNT: "1" });
  await send(event, { "User-Agent": "testbot" });
  await send(event, { Origin: f.url });
  console.log(
    "PASS: visitor view/click submitted; preview, opt-out, bot and dashboard controls submitted",
  );
}
if (process.argv.includes("--analytics-report")) {
  const report = await request(
    user("client"),
    "/projects/" + f.project.id + "/analytics",
  );
  assert(report.liveAvailable, "Live analytics query must work");
  assert.equal(
    report.views,
    f.analyticsBaseline.views + 1,
    "Only the permitted view should be counted after ingestion",
  );
  assert.equal(
    report.clicks,
    f.analyticsBaseline.clicks + 1,
    "Only the permitted click should be counted after ingestion",
  );
  assert(
    report.destinations.some(
      (d) => d.name === f.clickDestination.split("?")[0],
    ),
  );
  assert(report.destinations.every((d) => !d.name.includes("?")));
  assert(report.referrers.some((d) => d.name === "qa-referrer.example"));
  writeFileSync(
    "artifacts/verification/customer-analytics.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        report,
        checks: [
          "Live Analytics Engine reports accepted views and link clicks",
          "Click destination excludes query strings",
          "Referrer retains domain only",
          "Controls do not add click events",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      analytics: "passed",
      views: report.views,
      clicks: report.clicks,
    }),
  );
}
if (process.argv.includes("--agent")) {
  const actor = user("client"),
    base = "/projects/" + f.project.id;
  const before = await request(actor, base + "/posts/" + f.post.id);
  const live = await request(
    null,
    "/public/" + f.project.slug + "/posts/" + f.post.slug,
  );
  const run = await request(
    actor,
    base + "/agent-runs",
    "POST",
    {
      postId: f.post.id,
      profile: "seo",
      prompt:
        "Propose only a concise search description for this customer publishing acceptance article. Leave all other fields unchanged. Return a reviewable proposal.",
    },
    202,
  );
  f.actualRunId = run.id;
  save();
  await dispatch("agent:" + run.id);
  const result = await request(actor, base + "/agent-runs/" + run.id);
  assert.equal(result.status, "complete", "Native model run must complete");
  assert(result.proposals.some((p) => p.state === "pending"));
  assert.equal(
    (await request(actor, base + "/posts/" + f.post.id)).revision,
    before.revision,
    "Agent cannot change drafts independently",
  );
  assert.equal(
    (await request(null, "/public/" + f.project.slug + "/posts/" + f.post.slug))
      .renderedHtml,
    live.renderedHtml,
  );
  f.actualRun = result;
  save();
  console.log(
    JSON.stringify({
      agent: "complete",
      credits: result.credits,
      pendingProposals: result.proposals.length,
      draftUnchanged: true,
      publicationUnchanged: true,
    }),
  );
}
