import { describe, test, expect } from "bun:test";
import { app } from "../src/index.js";
import { getEffectiveProjectRole } from "../src/lib/permissions.js";
import {
  verifyDraftAssertion,
  signDraftAssertion,
} from "../src/lib/draft-auth.js";
import { renderBlockNote } from "../src/lib/render.js";
import { fixture } from "./support.js";

function request(
  f: ReturnType<typeof fixture>,
  path: string,
  key: string,
  method = "GET",
  body?: unknown,
) {
  return app.request(
    path,
    {
      method,
      headers: { "x-api-key": key, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    f.env,
    f.ctx,
  );
}

describe("authorization and contracts", () => {
  test("project owners inherit access and keys cannot cross project or account boundaries", async () => {
    const f = fixture();
    const key = await f.key();
    expect(await getEffectiveProjectRole(f.env.MAIN_DB, "owner", "p1")).toBe(
      "project_admin",
    );
    expect((await request(f, "/projects/p1", key)).status).toBe(200);
    for (const path of [
      "/projects/p2",
      "/accounts/me",
      "/projects",
      "/projects/p1/api-keys",
      "/projects/p1/members",
    ])
      expect((await request(f, path, key)).status).toBe(403);
    expect((await request(f, "/projects/p2", key, "DELETE")).status).toBe(403);
  });
  test("read scopes, expiry and revocation are enforced", async () => {
    const f = fixture();
    const key = await f.key("p1", ["posts:read"]);
    expect((await request(f, "/projects/p1/posts", key)).status).toBe(200);
    expect(
      (await request(f, "/projects/p1/posts", key, "POST", { title: "Denied" }))
        .status,
    ).toBe(403);
    f.sql.run("UPDATE api_keys SET expires_at = ?", [f.now - 1]);
    expect((await request(f, "/projects/p1/posts", key)).status).toBe(401);
    f.sql.run("UPDATE api_keys SET expires_at = NULL, revoked_at = ?", [f.now]);
    expect((await request(f, "/projects/p1/posts", key)).status).toBe(401);
  });
  test("permission failures return 403 instead of an internal exception", async () => {
    const f = fixture();
    const key = await f.key("p1", ["posts:read"], "other");
    const response = await request(f, "/projects/p1/posts", key);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
  });
  test("pagination preserves timestamp ties, published-only totals and invalid inputs", async () => {
    const f = fixture();
    const key = await f.key();
    for (const id of ["a", "b", "c", "draft"])
      f.sql.run(
        "INSERT INTO posts (id,project_id,title,slug,status,author_id,published_at,created_at,updated_at) VALUES (?,'p1',?,?,?,'owner',100,100,100)",
        [id, id, id, id === "draft" ? "draft" : "published"],
      );
    const page1 = await (
      await app.request("/public/p1/posts?limit=2", {}, f.env, f.ctx)
    ).json();
    expect(page1.total).toBe(3);
    expect(page1.data.map((p: any) => p.id)).toEqual(["c", "b"]);
    const page2 = await (
      await app.request(
        `/public/p1/posts?limit=2&cursor=${page1.nextCursor}`,
        {},
        f.env,
        f.ctx,
      )
    ).json();
    expect(page2.total).toBe(3);
    expect(page2.data.map((p: any) => p.id)).toEqual(["a"]);
    for (const query of [
      "limit=NaN",
      "limit=0",
      "limit=201",
      "limit=1.5",
      "cursor=bad",
    ])
      expect(
        (await request(f, `/projects/p1/posts?${query}`, key)).status,
      ).toBe(400);
  });
  test("tag merges and post tag attachments cannot modify another project", async () => {
    const f = fixture();
    const key = await f.key();
    f.sql.run(
      "INSERT INTO tags (id,project_id,name,slug) VALUES ('t1','p1','One','one'),('t2','p2','Two','two')",
    );
    expect(
      (
        await request(f, "/projects/p1/tags/merge", key, "POST", {
          sourceId: "t2",
          targetId: "t1",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(f, "/projects/p1/posts", key, "POST", {
          title: "Post",
          tagIds: ["t2"],
        })
      ).status,
    ).toBe(400);
    expect(f.sql.query("SELECT count(*) AS count FROM tags").get()).toEqual({
      count: 2,
    });
  });
  test("publish, get, unpublish, and missing schedule use the real route contracts", async () => {
    const f = fixture();
    const key = await f.key();
    const created = await request(f, "/projects/p1/posts", key, "POST", {
      title: "Hello",
    });
    expect(created.status).toBe(201);
    const post = await created.json();
    expect(
      (await request(f, `/projects/p1/posts/${post.id}`, key)).status,
    ).toBe(200);
    expect(
      (await request(f, `/projects/p1/posts/${post.id}/publish`, key, "POST"))
        .status,
    ).toBe(200);
    expect(
      (await app.request("/public/p1/posts/hello", {}, f.env, f.ctx)).status,
    ).toBe(200);
    expect(
      (await request(f, `/projects/p1/posts/${post.id}/unpublish`, key, "POST"))
        .status,
    ).toBe(200);
    expect(
      (await app.request("/public/p1/posts/hello", {}, f.env, f.ctx)).status,
    ).toBe(404);
    expect(
      (
        await request(f, "/projects/p1/posts/missing/schedule", key, "POST", {
          scheduledAt: f.now + 100,
        })
      ).status,
    ).toBe(404);
  });
  test("media confirmation verifies R2, ignores claimed dimensions and is idempotent", async () => {
    const f = fixture();
    const key = await f.key();
    f.sql.run(
      "INSERT INTO webhooks (id,project_id,url,events,secret,enabled,created_at,updated_at) VALUES ('wh','p1','https://example.com','[\"media.uploaded\"]','secret',1,1,1)",
    );
    const presign = await (
      await request(f, "/projects/p1/media/presign", key, "POST", {
        filename: "test.png",
        mimeType: "image/png",
      })
    ).json();
    const path = `/projects/p1/media/confirm/${presign.mediaId}`;
    expect((await request(f, path, key, "POST", {})).status).toBe(409);
    f.objects.set(presign.key, {
      size: 128,
      httpMetadata: { contentType: "image/png" },
    });
    const result = await (
      await request(f, path, key, "POST", { size: 999, width: 999 })
    ).json();
    expect(result.size).toBe(128);
    expect(result.width).toBeNull();
    await request(f, path, key, "POST", {});
    expect(f.queue).toHaveLength(0);
    expect(
      f.sql
        .query("SELECT COUNT(*) AS count FROM media WHERE confirmed=1")
        .get(),
    ).toEqual({ count: 1 });
  });
  test("draft assertions reject tampering", async () => {
    const signature = await signDraftAssertion("secret", "assertion");
    expect(await verifyDraftAssertion("secret", "assertion", signature)).toBe(
      true,
    );
    expect(await verifyDraftAssertion("secret", "changed", signature)).toBe(
      false,
    );
    expect(await verifyDraftAssertion("secret", "assertion", "invalid")).toBe(
      false,
    );
  });
  test("rendered content blocks executable URLs and injected heading markup", async () => {
    const html = await renderBlockNote(
      JSON.stringify([
        {
          type: "heading",
          props: { level: '1 onclick="alert(1)"' },
          content: [
            {
              type: "link",
              href: "javascript:alert(1)",
              content: [{ type: "text", text: "Link" }],
            },
          ],
        },
      ]),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
  });
});

test("code blocks render without a Wasm runtime or unsafe HTML", async () => {
  const html = await renderBlockNote(
    JSON.stringify([
      {
        type: "codeBlock",
        props: { language: "typescript" },
        content: [{ type: "text", text: "const answer = 42; // </script>" }],
      },
    ]),
  );
  expect(html).toContain("const");
  expect(html).toContain("answer");
  expect(html).not.toContain("</script>");
});
