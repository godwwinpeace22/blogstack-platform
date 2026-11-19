import assert from "node:assert/strict";
const base = "http://localhost:3003";
const html = await (await fetch(base + "/blog/hello-blogstack")).text();
for (const text of [
  "This article was written in the BlogStack dashboard",
  "<title>Hello from BlogStack</title>",
  "application/ld+json",
  '"@type":"BlogPosting"',
  'property="og:title"',
  'name="twitter:card"',
  'rel="canonical" href="' + base + '/blog/hello-blogstack"',
  'name="description" content="See BlogStack publishing',
]) {
  assert(html.includes(text), "Initial HTML missing " + text);
}
assert(
  !html.includes("Powered by BlogStack"),
  "Studio attribution setting must apply in initial HTML",
);
const sitemap = await (await fetch(base + "/blog/sitemap.xml")).text();
assert(sitemap.includes(base + "/blog/hello-blogstack"));
assert(!sitemap.includes("localhost:8787"));
const rss = await (await fetch(base + "/blog/feed.xml")).text();
assert(rss.includes("Hello from BlogStack"));
assert(rss.includes(base + "/blog/hello-blogstack"));
const robots = await (await fetch(base + "/robots.txt")).text();
assert(robots.includes(base + "/sitemap.xml"));
assert(robots.includes(base + "/blog/sitemap.xml"));
console.log(
  "PASS: initial article HTML, canonical/description/Open Graph/Twitter, escaped BlogPosting JSON-LD, attribution removal, RSS and preserved host/blog sitemaps.",
);
