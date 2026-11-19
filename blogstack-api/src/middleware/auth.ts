import { createMiddleware } from "hono/factory";

import { permitsApiKey } from "../lib/api-key-policy.js";
import { enforceWriteAccess } from "../lib/entitlements.js";
import { initAuth } from "../lib/auth.js";
import type { HonoEnv } from "../types.js";

/**
 * Validates the session cookie (or X-API-Key header) and populates
 * `c.var.userId` and `c.var.accountId`.
 *
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  // ── API key path ──────────────────────────────────────────────────────────
  const apiKey = c.req.header("x-api-key");
  if (apiKey) {
    const key = await resolveApiKey(apiKey, c.env.MAIN_DB);
    if (!key)
      return c.json({ error: "Invalid API key", code: "INVALID_API_KEY" }, 401);
    const projectId = c.req.param("projectId");
    const segments = new URL(c.req.url).pathname.split("/").filter(Boolean);
    const resource =
      !segments[2] || segments[2] === "stats" ? "projects" : segments[2];
    if (!permitsApiKey(key, projectId, resource, c.req.method)) {
      return c.json(
        { error: "API key does not permit this operation", code: "FORBIDDEN" },
        403,
      );
    }
    c.set("apiKey", key);
    c.set("userId", key.userId);
    c.set("accountId", key.accountId);
    c.executionCtx.waitUntil(
      c.env.MAIN_DB.prepare(
        `UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?`,
      )
        .bind(key.id)
        .run(),
    );
    await enforceWriteAccess(c);
    return next();
  }

  // ── Session cookie path ───────────────────────────────────────────────────
  const auth = initAuth(c.env, `${c.env.API_URL}/api/auth`);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  // Every user may own one billing account. Invitations do not start its trial.
  await c.env.MAIN_DB.prepare(
    "INSERT OR IGNORE INTO accounts(id,owner_id,plan,created_at) VALUES(?,?,'hobby',unixepoch())",
  )
    .bind(crypto.randomUUID(), session.user.id)
    .run();
  const owned = await c.env.MAIN_DB.prepare(
    "SELECT id FROM accounts WHERE owner_id=?",
  )
    .bind(session.user.id)
    .first<{ id: string }>();
  let accountId = c.req.header("x-blogstack-account-id") || owned?.id;
  const projectId = c.req.param("projectId");
  if (projectId) {
    const project = await c.env.MAIN_DB.prepare(
      "SELECT account_id FROM projects WHERE id=?",
    )
      .bind(projectId)
      .first<{ account_id: string }>();
    if (project) accountId = project.account_id;
  } else if (accountId && accountId !== owned?.id) {
    const member = await c.env.MAIN_DB.prepare(
      "SELECT 1 FROM account_members WHERE account_id=? AND user_id=? AND joined_at IS NOT NULL",
    )
      .bind(accountId, session.user.id)
      .first();
    if (!member)
      return c.json({ error: "Account access denied", code: "FORBIDDEN" }, 403);
  }
  if (!accountId)
    return c.json({ error: "Account not found", code: "NOT_FOUND" }, 404);

  c.set("userId", session.user.id);
  c.set("accountId", accountId);
  await enforceWriteAccess(c);
  return next();
});

// ─── API key resolution ───────────────────────────────────────────────────────

async function resolveApiKey(
  plaintext: string,
  db: import("@cloudflare/workers-types").D1Database,
): Promise<{
  id: string;
  userId: string;
  accountId: string;
  projectId: string;
  scopes: string[];
} | null> {
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(plaintext),
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));

  const row = await db
    .prepare(
      `SELECT ak.id, ak.created_by AS user_id, p.account_id, ak.project_id, ak.scopes
       FROM api_keys ak
       JOIN projects p ON p.id = ak.project_id
       WHERE ak.key_hash = ? AND ak.revoked_at IS NULL AND (ak.expires_at IS NULL OR ak.expires_at > unixepoch())`,
    )
    .bind(hash)
    .first<{
      id: string;
      user_id: string;
      account_id: string;
      project_id: string;
      scopes: string;
    }>();

  if (!row) return null;
  let scopes: unknown;
  try {
    scopes = JSON.parse(row.scopes);
  } catch {
    return null;
  }
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === "string")
  )
    return null;
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    projectId: row.project_id,
    scopes,
  };
}
