import { serializeSignedCookie } from "better-call";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { Bindings } from "../src/types.js";

/** Execute real migrated SQLite SQL behind the D1 interface. No query stubs. */
export function fixture() {
  const sql = new Database(":memory:");
  for (const file of readdirSync(
    new URL("../migrations/", import.meta.url),
  ).sort())
    sql.exec(
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  function prepare(query: string) {
    let values: any[] = [];
    function all() {
      const results = sql.query(query).all(...values);
      const changes = (
        sql.query("SELECT changes() AS changes").get() as { changes: number }
      ).changes;
      return { results, success: true, meta: { changes } };
    }
    return {
      bind(...args: any[]) {
        values = args;
        return this;
      },
      async first() {
        return sql.query(query).get(...values);
      },
      async all() {
        return all();
      },
      _all: all,
      async raw() {
        return sql.query(query).values(...values);
      },
      async run() {
        const r = sql.query(query).run(...values);
        return { success: true, results: [], meta: { changes: r.changes } };
      },
    };
  }
  const queue: any[] = [];
  const cache = new Map<string, any>();
  const objects = new Map<string, any>();
  const env = {
    MAIN_DB: {
      prepare,
      batch: async (statements: any[]) =>
        sql.transaction(() => statements.map((s) => s._all()))(),
    },
    CACHE: {
      get: async (key: string) => cache.get(key) ?? null,
      put: async (key: string, value: any) => {
        cache.set(key, value);
      },
      delete: async (key: string) => {
        cache.delete(key);
      },
    },
    CDN_CACHE: {
      get: async () => null,
      delete: async () => {},
      list: async () => ({ keys: [] }),
    },
    MEDIA: {
      head: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => {
        objects.delete(key);
      },
    },
    WEBHOOK_QUEUE: {
      send: async (message: any) => {
        queue.push(message);
      },
    },
    BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
    API_URL: "http://localhost:8787",
    FRONTEND_URL: "http://localhost:3001",
    CDN_URL: "http://localhost:8788",
    CDN_SECRET: "test-cdn-secret",
  } as unknown as Bindings;
  const now = Math.floor(Date.now() / 1000);
  for (const id of ["owner", "other", "writer"])
    sql.run(
      "INSERT INTO users (id,email,name,email_verified,created_at,updated_at) VALUES (?,?,?,1,?,?)",
      [id, `${id}@example.com`, id, now, now],
    );
  sql.run(
    "INSERT INTO accounts (id,owner_id,plan,created_at) VALUES ('account','owner','team',?)",
    [now],
  );
  for (const id of ["p1", "p2"])
    sql.run(
      "INSERT INTO projects (id,account_id,name,slug,created_by,created_at) VALUES (?,'account',?,?,'owner',?)",
      [id, id, id, now],
    );
  sql.run("UPDATE projects SET settings=?", [
    JSON.stringify({ blogUrl: "https://example.com/blog" }),
  ]);
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    passThroughOnException() {},
    props: {},
  } as ExecutionContext;
  async function key(
    projectId = "p1",
    scopes = [
      "projects:read",
      "posts:read",
      "posts:write",
      "media:read",
      "media:write",
      "tags:read",
      "tags:write",
    ],
    creator = "owner",
  ) {
    const token = crypto.randomUUID();
    const hash = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(token),
          ),
        ),
      ),
    );
    sql.run(
      "INSERT INTO api_keys (id,project_id,name,key_hash,key_prefix,created_by,created_at,scopes) VALUES (?,?,?,?,?,?,?,?)",
      [
        token,
        projectId,
        "test",
        hash,
        "test",
        creator,
        now,
        JSON.stringify(scopes),
      ],
    );
    return token;
  }
  async function session(userId = "owner") {
    const token = crypto.randomUUID();
    sql.run(
      "INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      [crypto.randomUUID(), userId, token, now + 3600, now, now],
    );
    return (
      await serializeSignedCookie(
        "better-auth.session_token",
        token,
        env.BETTER_AUTH_SECRET,
        { path: "/" },
      )
    ).split(";")[0]!;
  }
  return { sql, env, ctx, key, session, objects, queue, now, pending };
}
