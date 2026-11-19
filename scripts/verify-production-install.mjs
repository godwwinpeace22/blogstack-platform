import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    site: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    forbid: { type: "string" },
    absent: { type: "boolean", default: false },
    label: { type: "string", default: "published" },
  },
});
for (const key of ["site", "slug"])
  if (!values[key]) throw new Error("Missing --" + key);
if (!/^[a-z0-9-]+$/.test(values.label))
  throw new Error("Invalid evidence label");
const origin = new URL(values.site).origin;
const article = origin + "/blog/" + encodeURIComponent(values.slug);
const evidence = {
  site: origin,
  article,
  checkedAt: new Date().toISOString(),
  checks: [],
};
async function check(path) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(30000),
    redirect: "manual",
  });
  return { response, text: await response.text() };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
  evidence.checks.push(message);
}
const result = await check("/blog/" + encodeURIComponent(values.slug));
const sitemap = await check("/blog/sitemap.xml");
const feed = await check("/blog/feed.xml");
const listing = await check("/blog");
if (values.absent) {
  assert(
    result.response.status === 404,
    "Unpublished article returns HTTP 404",
  );
  for (const [name, page] of [
    ["sitemap", sitemap],
    ["RSS", feed],
    ["listing", listing],
  ])
    assert(
      page.response.ok && !page.text.includes("/blog/" + values.slug),
      "Unpublished URL absent from " + name,
    );
} else {
  assert(result.response.ok, "Article returns HTTP 200");
  if (values.forbid)
    assert(
      !result.text.includes(values.forbid),
      "Saved private revision is absent from the public response",
    );
  const visible = result.text.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  assert(
    visible.includes(values.body || "BlogStack gives developers"),
    "Article body exists in initial HTML without JavaScript",
  );
  assert(
    result.text.includes(
      "<title>" +
        (values.title || "Publish a blog inside your own website | BlogStack") +
        "</title>",
    ),
    "Search title exists in initial HTML",
  );
  assert(
    result.text.includes('rel="canonical" href="' + article + '"'),
    "Canonical matches the production article URL",
  );
  assert(
    result.text.includes('property="og:description"') &&
      result.text.includes('property="og:image"'),
    "Social description and image exist in initial HTML",
  );
  const json = result.text.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  const schema = json ? JSON.parse(json) : null;
  assert(
    schema?.["@type"] === "BlogPosting" &&
      JSON.stringify(schema).includes(article),
    "BlogPosting JSON-LD uses the production URL",
  );
  const imageUrl = result.text.match(
    /<meta property="og:image" content="([^"]+)"/,
  )?.[1];
  const image = imageUrl
    ? await fetch(imageUrl.replaceAll("&amp;", "&"), {
        signal: AbortSignal.timeout(30000),
      })
    : null;
  assert(
    image?.ok && image.headers.get("content-type")?.startsWith("image/"),
    "Published cover image is delivered by the CDN",
  );
  await image?.body?.cancel();
  for (const [name, page] of [
    ["sitemap", sitemap],
    ["RSS", feed],
    ["listing", listing],
  ])
    assert(
      page.response.ok && page.text.includes("/blog/" + values.slug),
      "Published URL included in " + name,
    );
}
const rootMap = await check("/sitemap.xml"),
  robots = await check("/robots.txt");
assert(
  rootMap.response.ok && rootMap.text.includes("<loc>" + origin + "</loc>"),
  "Existing website root sitemap is preserved",
);
assert(
  robots.response.ok &&
    robots.text.includes(origin + "/sitemap.xml") &&
    robots.text.includes(origin + "/blog/sitemap.xml"),
  "Robots advertises both website and blog sitemaps",
);
assert(
  ![result, sitemap, feed, listing, rootMap, robots].some((p) =>
    p.text.includes("localhost:"),
  ),
  "Production responses contain no localhost URLs",
);
mkdirSync("artifacts/verification", { recursive: true });
writeFileSync(
  "artifacts/verification/production-install-" + values.label + ".json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
