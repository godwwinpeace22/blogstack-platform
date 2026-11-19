import { test, expect } from "bun:test";
import {
  sanitizeArticle,
  parseDocument,
  documentLinks,
  analyzeSeo,
} from "../src/index.js";
test("the SSR sanitizer preserves article content and removes executable markup", () => {
  const html = sanitizeArticle(
    '<h2>Server body</h2><img src="x" onerror="attack()"><a href="javascript:attack()">link</a><script>attack()</script><svg onload="attack()"></svg>',
  );
  expect(html).toContain("Server body");
  expect(html).not.toContain("attack()");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<svg");
});
test("nested content and link checks work without the editor runtime", () => {
  const content = JSON.stringify([
    {
      type: "bulletListItem",
      content: [{ type: "text", text: "Top" }],
      children: [
        {
          type: "paragraph",
          content: [
            {
              type: "link",
              href: "/blog/relevant",
              content: [{ type: "text", text: "Read more" }],
            },
          ],
        },
      ],
    },
  ]);
  expect(parseDocument(content)).toHaveLength(1);
  expect(documentLinks(content, "https://example.com/blog")[0]).toEqual({
    href: "https://example.com/blog/relevant",
    anchor: "Read more",
    kind: "internal",
  });
  const report = analyzeSeo(
    { title: "Title", slug: "title", content, revision: 7 },
    "https://example.com/blog",
  );
  expect(report.revision).toBe(7);
  expect(report.issues.some((i) => i.code === "missing_description")).toBe(
    true,
  );
  expect(() => parseDocument('[{"type":"arbitrary-html"}]')).toThrow();
});
test("highlight colors survive SSR without permitting layout or executable CSS", () => {
  const html = sanitizeArticle(
    '<pre style="color:#fff;background-color:#111;position:fixed"><code><span style="color:#f80;behavior:url(javascript:alert(1))">const</span></code></pre>',
  );
  expect(html).toContain("color:#fff");
  expect(html).toContain("background-color:#111");
  expect(html).not.toContain("position");
  expect(html).not.toContain("behavior");
  expect(html).not.toContain("javascript:");
});
