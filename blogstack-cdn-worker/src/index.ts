export interface Env {
  R2: R2Bucket;
  MAIN_DB: D1Database;
  CDN_CACHE: KVNamespace;
  CDN_SECRET: string;
  API_BASE_URL: string;
}
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export async function verifyUpload(
  key: string,
  type: string,
  expires: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  if (
    !secret ||
    !/^\d+$/.test(expires) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) <= now ||
    Number(expires) > now + 900 ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !TYPES.has(type)
  )
    return false;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    material,
    Uint8Array.from(signature.match(/../g)!, (b) => parseInt(b, 16)),
    new TextEncoder().encode(`PUT:${key}:${type}:${expires}`),
  );
}

function isImage(bytes: Uint8Array, type: string): boolean {
  const text = new TextDecoder("latin1");
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (type === "image/gif")
    return ["GIF87a", "GIF89a"].includes(text.decode(bytes.slice(0, 6)));
  if (type === "image/webp")
    return (
      text.decode(bytes.slice(0, 4)) === "RIFF" &&
      text.decode(bytes.slice(8, 12)) === "WEBP"
    );
  return (
    type === "image/avif" &&
    text.decode(bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(text.decode(bytes.slice(8, 12)))
  );
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  let key: string;
  try {
    key = decodeURIComponent(
      url.pathname.slice(url.pathname.startsWith("/upload/") ? 8 : 1),
    );
  } catch {
    return new Response("Invalid path", { status: 400 });
  }
  if (!key || key.includes("..") || key.startsWith("/"))
    return new Response("Not found", { status: 404 });
  if (url.pathname.startsWith("/upload/")) {
    if (request.method !== "PUT")
      return new Response("Method not allowed", { status: 405 });
    const type = url.searchParams.get("type") ?? "";
    if (
      !(await verifyUpload(
        key,
        type,
        url.searchParams.get("expires") ?? "",
        url.searchParams.get("sig") ?? "",
        env.CDN_SECRET,
      ))
    )
      return new Response("Invalid or expired signature", { status: 401 });
    const media = await env.MAIN_DB.prepare(
      "SELECT m.id,m.confirmed,m.mime_type,m.reserved_size,m.reservation_expires_at,a.writable FROM media m JOIN projects p ON p.id=m.project_id JOIN account_access a ON a.account_id=p.account_id WHERE m.key = ?",
    )
      .bind(key)
      .first<{
        id: string;
        confirmed: number;
        mime_type: string;
        reserved_size: number;
        reservation_expires_at: number;
        writable: number;
      }>();
    if (
      !media ||
      !media.writable ||
      media.reservation_expires_at <= Math.floor(Date.now() / 1000) ||
      media.confirmed ||
      media.mime_type !== type
    )
      return new Response("Upload is not pending", { status: 409 });
    if (request.headers.get("content-type") !== type)
      return new Response("Content type mismatch", { status: 415 });
    if (
      Number(request.headers.get("content-length")) >
      Math.min(MAX_SIZE, media.reserved_size)
    )
      return new Response("Upload too large", { status: 413 });
    if (!request.body) return new Response("Empty upload", { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > Math.min(MAX_SIZE, media.reserved_size)) {
        await reader.cancel();
        return new Response("Upload too large", { status: 413 });
      }
      chunks.push(value);
    }
    if (!size) return new Response("Empty upload", { status: 400 });
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (!isImage(bytes, type))
      return new Response("Invalid image signature", { status: 415 });
    const object = await env.R2.put(key, bytes, {
      httpMetadata: { contentType: type },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!object) return new Response("Upload already exists", { status: 409 });
    const pending = await env.MAIN_DB.prepare(
      "SELECT m.id FROM media m JOIN projects p ON p.id=m.project_id JOIN account_access a ON a.account_id=p.account_id WHERE m.key=? AND (m.confirmed=1 OR (m.reservation_expires_at>unixepoch() AND a.writable=1))",
    )
      .bind(key)
      .first();
    if (!pending) {
      await env.R2.delete(key);
      return new Response("Upload reservation ended", { status: 410 });
    }
    return new Response(null, { status: 201 });
  }
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405 });
  // Public delivery starts only after the API confirms the immutable R2 object.
  const media = await env.MAIN_DB.prepare(
    "SELECT m.id FROM media m JOIN projects p ON p.id=m.project_id JOIN account_access a ON a.account_id=p.account_id WHERE m.key = ? AND m.confirmed = 1 AND a.public_delivery=1",
  )
    .bind(key)
    .first();
  if (!media) return new Response("Not found", { status: 404 });
  const object =
    request.method === "HEAD" ? await env.R2.head(key) : await env.R2.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type":
      object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Length": String(object.size),
    ETag: object.httpEtag,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.headers.get("if-none-match") === object.httpEtag) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  return new Response(
    request.method === "HEAD" ? null : (object as R2ObjectBody).body,
    { headers },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handle(request, env);
    // Upload URLs are bearer capabilities; no cookie credentials are used here.
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, HEAD, PUT, OPTIONS",
    );
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  },
} satisfies ExportedHandler<Env>;
