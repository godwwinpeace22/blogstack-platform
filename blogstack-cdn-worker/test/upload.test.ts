import { test, expect } from "bun:test";
import worker, { verifyUpload } from "../src/index.js";
import { fixture } from "../../blogstack-api/test/support.js";

test("upload signatures expire and bind the object and MIME type", async () => {
  const expires = String(Math.floor(Date.now() / 1000) + 300);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      material,
      new TextEncoder().encode(`PUT:p1/image.png:image/png:${expires}`),
    ),
  ).toString("hex");
  expect(
    await verifyUpload("p1/image.png", "image/png", expires, sig, "secret"),
  ).toBe(true);
  expect(
    await verifyUpload("p2/image.png", "image/png", expires, sig, "secret"),
  ).toBe(false);
  expect(
    await verifyUpload("p1/image.png", "image/jpeg", expires, sig, "secret"),
  ).toBe(false);
  expect(
    await verifyUpload("p1/image.png", "image/png", "NaN", sig, "secret"),
  ).toBe(false);
  expect(
    await verifyUpload("p1/image.png", "image/png", "1", sig, "secret"),
  ).toBe(false);
});

test("upload is immutable, rejects invalid images, and is hidden until confirmed", async () => {
  const f = fixture();
  const key = "p1/image.png";
  f.sql.run(
    "INSERT INTO media (id, project_id, key, url, filename, mime_type, uploaded_by, confirmed, created_at) VALUES ('image','p1',?,'url','image.png','image/png','owner',0,1)",
    [key],
  );
  f.sql.run("UPDATE media SET reservation_expires_at=?", [f.now + 300]);
  const objects = new Map();
  const env = {
    ...f.env,
    R2: {
      async put(key: string, data: Uint8Array, options: any) {
        if (objects.has(key) && options.onlyIf.etagDoesNotMatch === "*")
          return null;
        const object = {
          body: data,
          size: data.length,
          httpMetadata: options.httpMetadata,
          httpEtag: '"etag"',
        };
        objects.set(key, object);
        return object;
      },
      async get(key: string) {
        return objects.get(key) ?? null;
      },
      async head(key: string) {
        const object = objects.get(key);
        if (!object) return null;
        const { body, ...rest } = object;
        return rest;
      },
    },
  } as any;
  const expires = String(f.now + 300);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.CDN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      material,
      new TextEncoder().encode(`PUT:${key}:image/png:${expires}`),
    ),
  ).toString("hex");
  const upload = `http://localhost/upload/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}&type=image%2Fpng`;
  const put = (body: Uint8Array | string) =>
    worker.fetch(
      new Request(upload, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body,
      }),
      env,
    );
  expect((await put("<script>bad</script>")).status).toBe(415);
  expect(
    (await put(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).status,
  ).toBe(201);
  expect(
    (await put(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).status,
  ).toBe(409);
  const url = `http://localhost/${encodeURIComponent(key)}`;
  expect((await worker.fetch(new Request(url), env)).status).toBe(404);
  f.sql.run("UPDATE media SET confirmed = 1");
  const read = await worker.fetch(new Request(url), env);
  expect(read.status).toBe(200);
  expect(read.headers.get("content-type")).toBe("image/png");
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env);
  expect(await head.text()).toBe("");
  expect(head.headers.get("content-length")).toBe("8");
  f.sql.run("DELETE FROM media");
  expect((await worker.fetch(new Request(url), env)).status).toBe(404);
});
