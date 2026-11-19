import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const auth = JSON.parse(
  readFileSync(".launch/billing-sandbox-fixture.json", "utf8"),
);
const owner = auth.users.find(
  (u) => u.plan === "studio" && u.interval === "month",
);
const base = auth.url;
assert.match(new URL(base).hostname, /^blogstack-sandbox-app\./);
const path = ".launch/publishing-sandbox-fixture.json";
const f = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const save = () =>
  writeFileSync(path, JSON.stringify(f, null, 2) + "\n", { mode: 0o600 });
async function request(route, method = "GET", body, expected = 200) {
  const r = await fetch(base + route, {
    method,
    headers: {
      Origin: base,
      Cookie: owner.cookie,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status !== expected)
    throw new Error(
      method + " " + route + " returned " + r.status + ", expected " + expected,
    );
  return r.json();
}
const fixtureHost =
  "https://blogstack-check-fixtures.hidden-silence-2d18.workers.dev";
if (process.argv.includes("--prepare")) {
  if (!f.project) {
    f.project = await request(
      "/projects",
      "POST",
      {
        name: "BlogStack release acceptance",
        slug: "release-acceptance",
        settings: {
          blogUrl:
            "https://blogstack-site.hidden-silence-2d18.workers.dev/blog",
          hideAttribution: true,
          workspaceName: "Test Agency",
        },
      },
      201,
    );
    save();
  }
  const p = "/projects/" + f.project.id;
  if (!f.media) {
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOe8AAAAASUVORK5CYII=",
      "base64",
    );
    const presign = await request(p + "/media/presign", "POST", {
      filename: "launch-test.png",
      mimeType: "image/png",
      size: image.length,
    });
    const before = await fetch(
      "https://blogstack-sandbox-cdn.hidden-silence-2d18.workers.dev/" +
        encodeURIComponent(presign.key),
    );
    assert.equal(before.status, 404);
    const upload = await fetch(presign.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: image,
      signal: AbortSignal.timeout(20000),
    });
    assert(upload.ok, "Signed upload must succeed");
    f.media = await request(p + "/media/confirm/" + presign.mediaId, "POST", {
      width: 1,
      height: 1,
    });
    save();
    const publicImage = await fetch(f.media.url);
    assert(publicImage.ok);
    assert.equal((await publicImage.arrayBuffer()).byteLength, image.length);
    console.log(
      "PASS signed R2 upload, hidden pending media, confirmation and public image delivery",
    );
  }
  if (!f.post) {
    const links = [
      "ok",
      "missing",
      "blocked",
      "redirect",
      "private-redirect",
      "loop",
      "slow",
    ].map((name) => ({
      type: "link",
      href: fixtureHost + "/" + name,
      content: [{ type: "text", text: name + " ", styles: {} }],
    }));
    links.push({
      type: "link",
      href: "http://127.0.0.1/",
      content: [{ type: "text", text: "private address", styles: {} }],
    });
    const content = JSON.stringify([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Published acceptance article body. ",
            styles: {},
          },
          ...links,
        ],
        children: [],
      },
      {
        type: "image",
        props: {
          url: f.media.url,
          name: "launch-test.png",
          caption: "Acceptance image",
          showPreview: true,
          previewWidth: 32,
        },
        children: [],
      },
    ]);
    f.post = await request(
      p + "/posts",
      "POST",
      {
        title: "Release acceptance article",
        slug: "acceptance-article",
        content,
        excerpt: "Release test excerpt",
        coverImage: f.media.url,
        seoTitle: "Release SEO title",
        seoDescription: "Release test metadata",
        noIndex: true,
      },
      201,
    );
    save();
    f.post = await request(p + "/posts/" + f.post.id + "/publish", "POST", {
      revision: f.post.revision,
    });
    save();
    console.log(
      "PASS illustrated publication with persisted excerpt and SEO metadata",
    );
  }
}
if (process.argv.includes("--check")) {
  const p = "/projects/" + f.project.id,
    publicPath = "/public/" + f.project.slug + "/posts/" + f.post.slug;
  let live = await request(publicPath);
  assert(live.renderedHtml.includes("Published acceptance article body."));
  assert(live.renderedHtml.includes("<img"));
  assert.equal(live.seoTitle, "Release SEO title");
  assert.equal(live.excerpt, "Release test excerpt");
  if (!f.privateDraft) {
    f.privateDraft = await request(p + "/posts/" + f.post.id, "PATCH", {
      revision: f.post.revision,
      title: "Private revision title",
    });
    save();
    await request(
      p + "/posts/" + f.post.id + "/publish",
      "POST",
      { revision: f.post.revision },
      409,
    );
  }
  live = await request(publicPath);
  assert.equal(live.title, "Release acceptance article");
  const info = await request("/public/" + f.project.slug);
  assert.equal(info.branding.showAttribution, false);
  assert.equal(info.branding.workspaceName, "Test Agency");
  const sitemap = await fetch(
    base + "/public/" + f.project.slug + "/sitemap.xml",
  ).then((r) => r.text());
  assert(!sitemap.includes(f.post.slug));
  const seo = await request(p + "/seo?postId=" + f.post.id);
  assert(seo.issues);
  console.log(
    "PASS private-draft isolation, stale publication rejection, branding, noindex sitemap exclusion and SEO report",
  );
  const report = await request(p + "/links");
  writeFileSync(
    "artifacts/verification/link-scanner-deployed.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        environment: "Cloudflare isolated sandbox",
        ...report,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      links: report.links.map((l) => ({
        url: l.url,
        status: l.status,
        httpStatus: l.httpStatus,
      })),
      scans: report.scans,
    }),
  );
}
if (process.argv.includes("--scan")) {
  f.scan = await request(
    "/projects/" + f.project.id + "/links/scans",
    "POST",
    {},
    202,
  );
  save();
  console.log("Requested deployed scanner audit");
}
if (process.argv.includes("--prepare-finish") && !f.republished) {
  const p = "/projects/" + f.project.id;
  const longSlug =
    "an-article-with-a-slug-longer-than-d1s-like-pattern-limit-for-real-publications";
  if (!f.longTarget) {
    const target = await request(
      p + "/posts",
      "POST",
      {
        title: "Long-slug acceptance target",
        slug: longSlug,
        noIndex: true,
        content: JSON.stringify([
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Internal-link acceptance target",
                styles: {},
              },
            ],
            children: [],
          },
        ]),
      },
      201,
    );
    f.longTarget = await request(
      p + "/posts/" + target.id + "/publish",
      "POST",
      { revision: target.revision },
    );
    save();
  }
  const source = await request(p + "/posts/" + f.post.id);
  const content = JSON.parse(source.content);
  content.push({
    type: "paragraph",
    content: [
      {
        type: "link",
        href:
          f.project.settings.blogUrl + "/" + longSlug + "?ref=release#section",
        content: [
          { type: "text", text: "Related acceptance article", styles: {} },
        ],
      },
    ],
    children: [],
  });
  const draft = await request(p + "/posts/" + source.id, "PATCH", {
    revision: source.revision,
    content: JSON.stringify(content),
  });
  f.republished = await request(
    p + "/posts/" + source.id + "/publish",
    "POST",
    { revision: draft.revision },
  );
  save();
  console.log(
    "PASS private revision republished; prepared long-slug internal-link regression",
  );
}
if (process.argv.includes("--finish") && !f.finished) {
  const p = "/projects/" + f.project.id;
  if (!f.targetUnpublished) {
    const report = await request(p + "/links");
    assert(
      report.links.some(
        (l) =>
          l.kind === "internal" &&
          l.url.includes(f.longTarget.slug) &&
          l.status === "healthy",
      ),
      "Wait for the real indexing job before finishing",
    );
    await request(p + "/posts/" + f.longTarget.id + "/unpublish", "POST", {});
    f.targetUnpublished = true;
    save();
  }
  const report = await request(p + "/links");
  assert(
    report.links.some(
      (l) =>
        l.kind === "internal" &&
        l.url.includes(f.longTarget.slug) &&
        l.status === "broken",
    ),
  );
  const live = await request(
    "/public/" + f.project.slug + "/posts/" + f.post.slug,
  );
  assert.equal(live.title, "Private revision title");
  await request(p + "/posts/" + f.post.id + "/unpublish", "POST", {});
  await request(
    "/public/" + f.project.slug + "/posts/" + f.post.slug,
    "GET",
    undefined,
    404,
  );
  const exported = await request(p + "/export");
  assert(exported.posts.some((post) => post.id === f.post.id));
  assert(exported.drafts.some((draft) => draft.post_id === f.post.id));
  assert(exported.media.some((media) => media.id === f.media.id));
  const download = await fetch(
    base + exported.media.find((media) => media.id === f.media.id).downloadPath,
    { headers: { Cookie: owner.cookie }, signal: AbortSignal.timeout(20000) },
  );
  assert(download.ok);
  assert((await download.arrayBuffer()).byteLength > 0);
  f.finished = true;
  save();
  writeFileSync(
    "artifacts/verification/publishing-sandbox.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        environment: "isolated Cloudflare sandbox",
        signedUpload: true,
        illustratedPublication: true,
        privateDraftIsolation: true,
        staleRevisionRejected: true,
        republish: true,
        longSlugUnpublish: true,
        normalizedInternalLinkHealth: true,
        unpublish: true,
        contentExport: true,
        authenticatedMediaExport: true,
        branding: true,
        seoMetadata: true,
        noindexSitemap: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS deployed republish, long-slug unpublish, internal health, public withdrawal, content and media export",
  );
}
