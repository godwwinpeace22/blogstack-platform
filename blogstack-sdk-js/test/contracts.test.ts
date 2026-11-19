import { test, expect } from "bun:test";
import { BlogStackClient } from "../src/index.js";
import { app } from "../../blogstack-api/src/index.js";
import { fixture } from "../../blogstack-api/test/support.js";

test("SDK post, media, tags and public methods use API paths and response contracts", async () => {
  const f = fixture();
  const key = await f.key();
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) =>
    app.request(String(input), init, f.env, f.ctx)) as typeof fetch;
  const sdk = new BlogStackClient({
    baseUrl: "http://localhost:8787",
    apiKey: key,
    fetch: fetcher,
  });
  const post = await sdk.posts.create("p1", { title: "From the SDK" });
  expect(post.status).toBe("draft");
  const list = await sdk.posts.list("p1", { limit: 1 });
  expect(list.data[0]?.id).toBe(post.id);
  expect(list.nextCursor).toBeNull();
  await sdk.posts.publish("p1", post.id);
  expect((await sdk.public.listPosts("p1")).data[0]?.id).toBe(post.id);
  expect((await sdk.public.getPost("p1", post.slug)).title).toBe(post.title);
  expect(await sdk.public.feed("p1")).toContain("<rss");
  await sdk.posts.unpublish("p1", post.id);
  expect((await sdk.public.listPosts("p1")).data).toHaveLength(0);
  const upload = await sdk.media.presign("p1", {
    filename: "test.png",
    mimeType: "image/png",
  });
  expect(upload.presignedUrl).toContain("/upload/");
  f.objects.set(upload.key, {
    size: 8,
    httpMetadata: { contentType: "image/png" },
  });
  expect((await sdk.media.confirm("p1", upload.mediaId)).size).toBe(8);
  expect((await sdk.media.list("p1")).data).toHaveLength(1);
  const one = await sdk.tags.create("p1", { name: "One" });
  const two = await sdk.tags.create("p1", { name: "Two" });
  expect(
    (await sdk.tags.merge("p1", { sourceId: one.id, targetId: two.id })).id,
  ).toBe(two.id);
  expect(await sdk.tags.list("p1")).toHaveLength(1);
});

test("feed honors custom fetch and propagates HTTP errors", async () => {
  const sdk = new BlogStackClient({
    fetch: (async () =>
      new Response("missing", { status: 404 })) as typeof fetch,
  });
  await expect(sdk.public.feed("missing")).rejects.toMatchObject({
    status: 404,
  });
});

test("account updates preserve the complete scoped account contract", async () => {
  const f = fixture(),
    cookie = await f.session();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
    app.request(
      String(input),
      {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          cookie,
          origin: f.env.FRONTEND_URL,
        },
      },
      f.env,
      f.ctx,
    )) as typeof fetch;
  const sdk = new BlogStackClient({ baseUrl: f.env.API_URL, fetch: fetcher });
  const updated = await sdk.accounts.update({ name: "Studio owner" });
  expect(updated.owner?.name).toBe("Studio owner");
  expect(updated).toEqual(await sdk.accounts.get());
  expect(updated.canWrite).toBe(true);
  expect(updated.limits.maxProjects).toBeNull();
  expect(updated.usage.blogs).toBe(2);
});
