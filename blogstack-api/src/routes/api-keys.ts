import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { API_KEY_SCOPES } from "../lib/api-key-policy.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import type { HonoEnv, DbApiKey } from "../types.js";

const app = new Hono<HonoEnv>();

// GET /projects/:projectId/api-keys
app.get("/:projectId/api-keys", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "project_admin");

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT * FROM api_keys WHERE project_id = ? ORDER BY created_at DESC`,
  )
    .bind(projectId)
    .all<DbApiKey>();

  return c.json(
    rows.results.map((k) => ({
      id: k.id,
      projectId: k.project_id,
      name: k.name,
      keyPrefix: k.key_prefix,
      createdBy: k.created_by,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      scopes: JSON.parse(k.scopes),
      expiresAt: k.expires_at,
      revokedAt: k.revoked_at,
    })),
  );
});

// POST /projects/:projectId/api-keys
app.post(
  "/:projectId/api-keys",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      scopes: z
        .array(z.enum(API_KEY_SCOPES))
        .min(1)
        .default([...API_KEY_SCOPES]),
      expiresAt: z
        .number()
        .int()
        .positive()
        .refine(
          (value) => value > Math.floor(Date.now() / 1000),
          "Expiry must be in the future",
        )
        .optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId } = c.req.param();

    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(role, "project_admin");

    const { name, scopes, expiresAt } = c.req.valid("json");

    // Generate key: bsk_live_ + 32 random hex chars
    const rawBytes = crypto.getRandomValues(new Uint8Array(24));
    const rawHex = Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const plaintext = `bsk_live_${rawHex}`;

    // SHA-256 hash for storage (never store plaintext)
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(plaintext),
    );
    const keyHash = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
    const keyPrefix = plaintext.slice(0, 16); // "bsk_live"

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await c.env.MAIN_DB.prepare(
      `INSERT INTO api_keys (id, project_id, name, key_hash, key_prefix, created_by, created_at, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        projectId,
        name,
        keyHash,
        keyPrefix,
        userId,
        now,
        JSON.stringify(scopes),
        expiresAt ?? null,
      )
      .run();

    return c.json(
      {
        id,
        projectId,
        name,
        keyPrefix,
        createdBy: userId,
        lastUsedAt: null,
        createdAt: now,
        // plaintext is returned ONCE — client must store it immediately
        plaintext,
        scopes,
        expiresAt: expiresAt ?? null,
        revokedAt: null,
      },
      201,
    );
  },
);

// DELETE /projects/:projectId/api-keys/:keyId
app.delete("/:projectId/api-keys/:keyId", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId, keyId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "project_admin");

  const result = await c.env.MAIN_DB.prepare(
    `UPDATE api_keys SET revoked_at = unixepoch() WHERE id = ? AND project_id = ? AND revoked_at IS NULL`,
  )
    .bind(keyId, projectId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "API key not found", code: "NOT_FOUND" }, 404);
  }

  return c.body(null, 204);
});

export default app;
