import * as React from "react";
import { test, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { BlogContent } from "../src/components/blog-content.js";
import { startBlogAnalytics, analyticsOptOut } from "@blogstack/core";
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});
test("article bodies and safe links exist in initial server HTML", () => {
  const html = renderToString(
    <BlogContent html='<h2>Initial HTML</h2><p>Article text</p><a href="https://example.com">Link</a><script>alert(1)</script>' />,
  );
  expect(html).toContain("<h2>Initial HTML</h2>");
  expect(html).toContain("<p>Article text</p>");
  expect(html).not.toContain("<script");
});
test("optional tracking omits credentials, preserves href and navigation, strips no link behavior and cleans listeners", () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  document.body.innerHTML =
    '<article data-blogstack-article><a id="story" href="https://example.com/destination?keep=1">Read</a></article>';
  const anchor = document.querySelector("a")!,
    event = new MouseEvent("click", { bubbles: true, cancelable: true });
  // Stop jsdom's asynchronous navigation, after observing that the tracker did not.
  let preserved = false;
  anchor.addEventListener("click", (e) => {
    preserved = !e.defaultPrevented;
    e.preventDefault();
  });
  const cleanup = startBlogAnalytics({ projectSlug: "journal", postId: "one" });
  anchor.dispatchEvent(event);
  expect(preserved).toBe(true);
  expect(anchor.href).toBe("https://example.com/destination?keep=1");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    keepalive: true,
  });
  cleanup();
  anchor.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test("opt-out, preview paths and dashboard preview flags suppress collection", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  analyticsOptOut(true);
  startBlogAnalytics({ projectSlug: "x", postId: "y" });
  analyticsOptOut(false);
  window.history.replaceState(null, "", "/preview/test");
  startBlogAnalytics({ projectSlug: "x", postId: "y" });
  window.history.replaceState(null, "", "/");
  startBlogAnalytics({ projectSlug: "x", postId: "y", preview: true });
  expect(fetcher).not.toHaveBeenCalled();
});

test("native route transitions display a newly server-fetched article", async () => {
  const { render, screen } = await import("@testing-library/react");
  const { BlogPost } = await import("../src/components/blog-post.js");
  const first = {
    id: "a",
    slug: "first",
    title: "First article",
    publishedAt: 1,
    renderedHtml: "<p>First body</p>",
  };
  const next = {
    id: "b",
    slug: "second",
    title: "Second article",
    publishedAt: 2,
    renderedHtml: "<p>Second body</p>",
  };
  const view = render(
    <BlogPost
      projectSlug="journal"
      slug="first"
      initialPost={first}
      showAttribution={false}
    />,
  );
  expect(screen.getByText("First body")).toBeTruthy();
  view.rerender(
    <BlogPost
      projectSlug="journal"
      slug="second"
      initialPost={next}
      showAttribution={false}
    />,
  );
  expect(await screen.findByText("Second body")).toBeTruthy();
  expect(screen.queryByText("First body")).toBeNull();
});
