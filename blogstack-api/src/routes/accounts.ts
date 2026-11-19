import { enqueue } from "../lib/jobs.js";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { accountAccess, accountUsage, limitsFor } from "../lib/entitlements.js";
import { requireAuth } from "../middleware/auth.js";
import { getAccountRole, assertAccountRole } from "../lib/permissions.js";
import { invitationEmail } from "../lib/email.js";
import type {
  HonoEnv,
  Bindings,
  DbAccount,
  DbAccountMember,
  DbInvitation,
} from "../types.js";

const app = new Hono<HonoEnv>();

app.get("/", requireAuth, async (c) => {
  const rows = await c.env.MAIN_DB.prepare(
    "SELECT a.id,a.owner_id AS ownerId,u.name,u.email FROM accounts a JOIN users u ON u.id=a.owner_id WHERE a.owner_id=? OR EXISTS(SELECT 1 FROM account_members m WHERE m.account_id=a.id AND m.user_id=? AND m.joined_at IS NOT NULL)",
  )
    .bind(c.var.userId, c.var.userId)
    .all<{ id: string; ownerId: string; name: string | null; email: string }>();
  return c.json(
    await Promise.all(
      rows.results.map(async (a) => ({
        ...a,
        role: await getAccountRole(c.env.MAIN_DB, c.var.userId, a.id),
      })),
    ),
  );
});
async function accountResponse(
  env: Bindings,
  accountId: string,
  userId: string,
) {
  const access = await accountAccess(env, accountId);
  const account = await env.MAIN_DB.prepare("SELECT * FROM accounts WHERE id=?")
    .bind(accountId)
    .first<DbAccount>();
  if (!account) throw new Error("Account not found");
  const owner = await env.MAIN_DB.prepare(
    "SELECT id,email,name,image AS avatarUrl FROM users WHERE id=?",
  )
    .bind(account.owner_id)
    .first();
  return {
    id: account.id,
    ownerId: account.owner_id,
    plan: access.plan,
    createdAt: account.created_at,
    owner,
    limits: limitsFor(access),
    role: await getAccountRole(env.MAIN_DB, userId, accountId),
    canWrite: !!access.writable,
    trialEndsAt: access.internal_access ? null : access.trial_ends_at,
    internalAccess: !!access.internal_access,
    paidThrough: access.paid_through,
    usage: await accountUsage(env, access),
  };
}
app.get("/me", requireAuth, async (c) =>
  c.json(await accountResponse(c.env, c.var.accountId, c.var.userId)),
);

// PATCH /accounts/me
app.patch(
  "/me",
  requireAuth,
  zValidator("json", z.object({ name: z.string().max(100).optional() })),
  async (c) => {
    const { accountId, userId } = c.var;

    const role = await getAccountRole(c.env.MAIN_DB, userId, accountId);
    assertAccountRole(role, "account_admin");

    // Currently only the user's display name is mutable at account level
    const { name } = c.req.valid("json");
    if (name !== undefined) {
      await c.env.MAIN_DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
        .bind(name, userId)
        .run();
    }

    return c.json(await accountResponse(c.env, accountId, userId));
  },
);

// GET /accounts/members
app.get("/members", requireAuth, async (c) => {
  const { accountId } = c.var;

  const members = await c.env.MAIN_DB.prepare(
    `SELECT am.*, u.email, u.name, u.image
     FROM account_members am
     JOIN users u ON u.id = am.user_id
     WHERE am.account_id = ?
     ORDER BY am.invited_at DESC`,
  )
    .bind(accountId)
    .all<DbAccountMember & { email: string; name: string; image: string }>();

  return c.json(
    members.results.map((m) => ({
      accountId: m.account_id,
      userId: m.user_id,
      role: m.role,
      invitedBy: m.invited_by,
      invitedAt: m.invited_at,
      joinedAt: m.joined_at,
      user: {
        id: m.user_id,
        email: m.email,
        name: m.name,
        avatarUrl: m.image,
      },
    })),
  );
});

// GET /accounts/invitations
app.get("/invitations", requireAuth, async (c) => {
  const { accountId, userId } = c.var;

  const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
  assertAccountRole(callerRole, "account_admin");

  const invitations = await c.env.MAIN_DB.prepare(
    `SELECT i.*, u.name AS inviter_name
     FROM invitations i
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.account_id = ? AND i.accepted_at IS NULL
     ORDER BY i.expires_at DESC`,
  )
    .bind(accountId)
    .all<DbInvitation & { inviter_name: string | null }>();

  return c.json(
    invitations.results.map((inv) => ({
      id: inv.id,
      accountId: inv.account_id,
      projectId: inv.project_id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invited_by,
      token: inv.token,
      expiresAt: inv.expires_at,
      acceptedAt: inv.accepted_at,
      inviterName: inv.inviter_name,
    })),
  );
});

// POST /accounts/members  — invite a new account-level member
app.post(
  "/members",
  requireAuth,
  zValidator(
    "json",
    z.object({
      email: z.email(),
      role: z.enum(["account_admin", "account_editor"]),
    }),
  ),
  async (c) => {
    const { accountId, userId } = c.var;
    const { email, role } = c.req.valid("json");

    // Only account_admin can invite other account members
    const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
    assertAccountRole(callerRole, "account_admin");

    const token = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    const invitationId = crypto.randomUUID();

    await c.env.MAIN_DB.prepare(
      `INSERT INTO invitations (id, account_id, email, role, invited_by, token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(invitationId, accountId, email, role, userId, token, expiresAt)
      .run();

    // Send invitation email (fire-and-forget — don't fail the request on email error)
    await enqueue(c.env, "email", {
      from: c.env.EMAIL_FROM,
      to: email,
      subject: "You've been invited to BlogStack",
      html: invitationEmail({
        inviteeName: email,
        inviterName: userId,
        projectOrAccountName: "your team",
        role,
        acceptUrl: `${c.env.FRONTEND_URL}/invite/${token}`,
      }),
    });

    return c.json(
      {
        id: invitationId,
        accountId,
        email,
        role,
        invitedBy: userId,
        token,
        expiresAt,
        acceptedAt: null,
      },
      201,
    );
  },
);

// POST /accounts/invitations/:invitationId/resend
app.post("/invitations/:invitationId/resend", requireAuth, async (c) => {
  const { accountId, userId } = c.var;
  const invitationId = c.req.param("invitationId");

  const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
  assertAccountRole(callerRole, "account_admin");

  const invitation = await c.env.MAIN_DB.prepare(
    `SELECT * FROM invitations WHERE id = ? AND account_id = ? AND accepted_at IS NULL`,
  )
    .bind(invitationId, accountId)
    .first<DbInvitation>();

  if (!invitation) {
    return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
  }

  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  await c.env.MAIN_DB.prepare(
    `UPDATE invitations SET token = ?, expires_at = ? WHERE id = ?`,
  )
    .bind(token, expiresAt, invitationId)
    .run();

  const inviter = await c.env.MAIN_DB.prepare(
    `SELECT name, email FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ name: string | null; email: string }>();

  await enqueue(c.env, "email", {
    from: c.env.EMAIL_FROM,
    to: invitation.email,
    subject: "You've been invited to BlogStack",
    html: invitationEmail({
      inviteeName: invitation.email,
      inviterName: inviter?.name ?? inviter?.email ?? "Someone",
      projectOrAccountName: "your team",
      role: invitation.role,
      acceptUrl: `${c.env.FRONTEND_URL}/invite/${token}`,
    }),
  });

  return c.json({
    id: invitation.id,
    accountId: invitation.account_id,
    projectId: invitation.project_id,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invited_by,
    token,
    expiresAt,
    acceptedAt: invitation.accepted_at,
  });
});

// DELETE /accounts/invitations/:invitationId
app.delete("/invitations/:invitationId", requireAuth, async (c) => {
  const { accountId, userId } = c.var;
  const invitationId = c.req.param("invitationId");

  const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
  assertAccountRole(callerRole, "account_admin");

  const result = await c.env.MAIN_DB.prepare(
    `DELETE FROM invitations WHERE id = ? AND account_id = ? AND accepted_at IS NULL`,
  )
    .bind(invitationId, accountId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
  }

  return c.body(null, 204);
});

// PATCH /accounts/members/:userId
app.patch(
  "/members/:userId",
  requireAuth,
  zValidator(
    "json",
    z.object({ role: z.enum(["account_admin", "account_editor"]) }),
  ),
  async (c) => {
    const { accountId, userId } = c.var;
    const targetUserId = c.req.param("userId");
    const { role } = c.req.valid("json");

    const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
    assertAccountRole(callerRole, "account_admin");

    const result = await c.env.MAIN_DB.prepare(
      `UPDATE account_members SET role = ? WHERE account_id = ? AND user_id = ?`,
    )
      .bind(role, accountId, targetUserId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
    }

    const member = await c.env.MAIN_DB.prepare(
      `SELECT am.*, u.email, u.name, u.image
       FROM account_members am JOIN users u ON u.id = am.user_id
       WHERE am.account_id = ? AND am.user_id = ?`,
    )
      .bind(accountId, targetUserId)
      .first<
        DbAccountMember & { email: string; name: string; image: string }
      >();

    return c.json({
      accountId: member!.account_id,
      userId: member!.user_id,
      role: member!.role,
      invitedBy: member!.invited_by,
      invitedAt: member!.invited_at,
      joinedAt: member!.joined_at,
      user: { id: member!.user_id, email: member!.email, name: member!.name },
    });
  },
);

// DELETE /accounts/members/:userId
app.delete("/members/:userId", requireAuth, async (c) => {
  const { accountId, userId } = c.var;
  const targetUserId = c.req.param("userId");

  const callerRole = await getAccountRole(c.env.MAIN_DB, userId, accountId);
  assertAccountRole(callerRole, "account_admin");

  // Cannot remove yourself if you're the owner
  const account = await c.env.MAIN_DB.prepare(
    `SELECT owner_id FROM accounts WHERE id = ?`,
  )
    .bind(accountId)
    .first<{ owner_id: string }>();

  if (account?.owner_id === targetUserId) {
    return c.json(
      { error: "Cannot remove the account owner", code: "FORBIDDEN" },
      403,
    );
  }

  await c.env.MAIN_DB.prepare(
    `DELETE FROM account_members WHERE account_id = ? AND user_id = ?`,
  )
    .bind(accountId, targetUserId)
    .run();

  return c.body(null, 204);
});

export default app;
