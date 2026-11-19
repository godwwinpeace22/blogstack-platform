import * as React from "react";
import { afterEach, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Blog } from "../src/components/blog.js";
import { BlogIndex } from "../src/components/blog-index.js";
import { BlogPost } from "../src/components/blog-post.js";
import { createBlogClient } from "../src/lib/blog-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const first = {
  id: "one",
  slug: "hello",
  title: "Hello world",
  publishedAt: 100,
  excerpt: "An introduction",
  renderedHtml:
    '<p>Article body</p><img src="x" onerror="alert(1)"><script>bad()</script>',
  author: { name: "Ada" },
};
const second = { ...first, id: "two", slug: "next", title: "Next story" };

test("one Blog component handles listing, pagination, reading, back and search", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/tags"))
      return Response.json([{ id: "tag", name: "Design", slug: "design" }]);
    if (url.pathname.endsWith("/posts/hello")) return Response.json(first);
    if (url.searchParams.has("q"))
      return Response.json({ data: [], nextCursor: null });
    if (url.searchParams.has("cursor"))
      return Response.json({ data: [second], nextCursor: null });
    return Response.json({ data: [first], nextCursor: "100:one" });
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <Blog
      projectSlug="journal"
      apiUrl="https://api.example.com"
      title="Field notes"
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "Field notes" }),
  ).toBeTruthy();
  await user.click(await screen.findByRole("button", { name: "More stories" }));
  expect(await screen.findByRole("link", { name: "Next story" })).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Hello world" }));
  expect(window.location.search).toBe("?post=hello");
  expect(await screen.findByText("Article body")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(document.querySelector("[onerror]")).toBeNull();
  await user.click(screen.getByRole("link", { name: "All stories" }));
  expect(window.location.search).toBe("");
  await user.type(await screen.findByRole("searchbox"), "nothing");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("No matching stories")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByRole("link", { name: "Hello world" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Design" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.includes("tag=design"))).toBe(
      true,
    ),
  );
});

test("a shared article URL opens directly and failures can be retried", async () => {
  window.history.replaceState(null, "", "/?post=hello");
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail ? new Response("error", { status: 500 }) : Response.json(first),
    ),
  );
  const user = userEvent.setup();
  render(<Blog projectSlug="journal" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Article body")).toBeTruthy();
});

test("server-provided listing and article data render without an initial request", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const listing = render(
    <React.StrictMode>
      <BlogIndex
        projectSlug="journal"
        showAttribution={true}
        initialPosts={[first]}
        initialTags={[{ id: "tag", name: "Design", slug: "design" }]}
      />
    </React.StrictMode>,
  );
  expect(screen.getByRole("link", { name: "Hello world" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Design" })).toBeTruthy();
  listing.unmount();
  render(
    <React.StrictMode>
      <BlogPost
        projectSlug="journal"
        slug="hello"
        initialPost={first}
        showAttribution={true}
      />
    </React.StrictMode>,
  );
  expect(screen.getByRole("heading", { name: "Hello world" })).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});

test("the public content client works in any Fetch API environment", async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/tags"))
      return Response.json([{ id: "tag", name: "Design", slug: "design" }]);
    if (url.pathname.endsWith("/posts/hello")) return Response.json(first);
    return Response.json({ data: [first], nextCursor: "100:one", total: 2 });
  });
  const client = createBlogClient({
    projectSlug: "client work",
    apiUrl: "https://api.example.com/",
    fetch: fetcher,
  });
  const page = await client.listPosts({
    limit: 12,
    query: "hello",
    tag: "design",
  });
  expect(page.data[0]?.title).toBe("Hello world");
  expect(page.total).toBe(2);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "https://api.example.com/public/client%20work/posts?limit=12&q=hello&tag=design",
  );
  await expect(client.getPost("hello")).resolves.toMatchObject({
    slug: "hello",
  });
  await expect(client.listTags()).resolves.toHaveLength(1);
});
