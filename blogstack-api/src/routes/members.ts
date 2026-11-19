import { enqueue } from "../lib/jobs.js";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";

import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import { invitationEmail } from "../lib/email.js";
import type {
  HonoEnv,
  DbProjectMember,
  DbUser,
  DbInvitation,
} from "../types.js";

const app = new Hono<HonoEnv>();

// GET /projects/:projectId/members
app.get("/projects/:projectId/members", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const role = await getEffectiveProjectRole(c.env.MAIN_DB, userId, projectId);
  assertProjectRole(role, "writer");

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT pm.*, u.email, u.name, u.image
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?
     ORDER BY pm.invited_at DESC`,
  )
    .bind(projectId)
    .all<DbProjectMember & { email: string; name: string; image: string }>();

  return c.json(
    rows.results.map((m) => ({
      projectId: m.project_id,
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

// GET /projects/:projectId/invitations
app.get("/projects/:projectId/invitations", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId } = c.req.param();

  const callerRole = await getEffectiveProjectRole(
    c.env.MAIN_DB,
    userId,
    projectId,
  );
  assertProjectRole(callerRole, "project_admin");

  const invitations = await c.env.MAIN_DB.prepare(
    `SELECT i.*, u.name AS inviter_name, p.name AS project_name
     FROM invitations i
     LEFT JOIN users u ON u.id = i.invited_by
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE i.project_id = ? AND i.accepted_at IS NULL
     ORDER BY i.expires_at DESC`,
  )
    .bind(projectId)
    .all<
      DbInvitation & {
        inviter_name: string | null;
        project_name: string | null;
      }
    >();

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
      projectName: inv.project_name,
    })),
  );
});

// POST /projects/:projectId/members — invite
app.post(
  "/projects/:projectId/members",
  requireAuth,
  zValidator(
    "json",
    z.object({
      email: z.email(),
      role: z.enum(["project_admin", "editor", "writer"]),
    }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId } = c.req.param();

    const callerRole = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(callerRole, "project_admin");

    const { email, role } = c.req.valid("json");

    const project = await c.env.MAIN_DB.prepare(
      `SELECT name FROM projects WHERE id = ?`,
    )
      .bind(projectId)
      .first<{ name: string }>();

    const inviter = await c.env.MAIN_DB.prepare(
      `SELECT name, email FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{ name: string; email: string }>();

    const token = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const id = crypto.randomUUID();

    await c.env.MAIN_DB.prepare(
      `INSERT INTO invitations (id, project_id, email, role, invited_by, token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, projectId, email, role, userId, token, expiresAt)
      .run();

    await enqueue(c.env, "email", {
      from: c.env.EMAIL_FROM,
      to: email,
      subject: `You've been invited to ${project?.name ?? "a project"} on BlogStack`,
      html: invitationEmail({
        inviteeName: email,
        inviterName: inviter?.name ?? inviter?.email ?? "Someone",
        projectOrAccountName: project?.name ?? "a project",
        role,
        acceptUrl: `${c.env.FRONTEND_URL}/invite/${token}`,
      }),
    });

    return c.json(
      {
        id,
        projectId,
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

// POST /projects/:projectId/invitations/:invitationId/resend
app.post(
  "/projects/:projectId/invitations/:invitationId/resend",
  requireAuth,
  async (c) => {
    const { userId } = c.var;
    const { projectId, invitationId } = c.req.param();

    const callerRole = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(callerRole, "project_admin");

    const invitation = await c.env.MAIN_DB.prepare(
      `SELECT * FROM invitations WHERE id = ? AND project_id = ? AND accepted_at IS NULL`,
    )
      .bind(invitationId, projectId)
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

    const project = await c.env.MAIN_DB.prepare(
      `SELECT name FROM projects WHERE id = ?`,
    )
      .bind(projectId)
      .first<{ name: string | null }>();

    const inviter = await c.env.MAIN_DB.prepare(
      `SELECT name, email FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{ name: string | null; email: string }>();

    await enqueue(c.env, "email", {
      from: c.env.EMAIL_FROM,
      to: invitation.email,
      subject: `You've been invited to ${project?.name ?? "a project"} on BlogStack`,
      html: invitationEmail({
        inviteeName: invitation.email,
        inviterName: inviter?.name ?? inviter?.email ?? "Someone",
        projectOrAccountName: project?.name ?? "a project",
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
  },
);

// DELETE /projects/:projectId/invitations/:invitationId
app.delete(
  "/projects/:projectId/invitations/:invitationId",
  requireAuth,
  async (c) => {
    const { userId } = c.var;
    const { projectId, invitationId } = c.req.param();

    const callerRole = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(callerRole, "project_admin");

    const result = await c.env.MAIN_DB.prepare(
      `DELETE FROM invitations WHERE id = ? AND project_id = ? AND accepted_at IS NULL`,
    )
      .bind(invitationId, projectId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
    }

    return c.body(null, 204);
  },
);

// PATCH /projects/:projectId/members/:userId
app.patch(
  "/projects/:projectId/members/:userId",
  requireAuth,
  zValidator(
    "json",
    z.object({ role: z.enum(["project_admin", "editor", "writer"]) }),
  ),
  async (c) => {
    const { userId } = c.var;
    const { projectId, userId: targetUserId } = c.req.param();

    const callerRole = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      userId,
      projectId,
    );
    assertProjectRole(callerRole, "project_admin");

    const { role } = c.req.valid("json");

    const result = await c.env.MAIN_DB.prepare(
      `UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`,
    )
      .bind(role, projectId, targetUserId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
    }

    const member = await c.env.MAIN_DB.prepare(
      `SELECT pm.*, u.email, u.name, u.image
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND pm.user_id = ?`,
    )
      .bind(projectId, targetUserId)
      .first<
        DbProjectMember & { email: string; name: string; image: string }
      >();

    return c.json({
      projectId: member!.project_id,
      userId: member!.user_id,
      role: member!.role,
      invitedBy: member!.invited_by,
      invitedAt: member!.invited_at,
      joinedAt: member!.joined_at,
      user: { id: member!.user_id, email: member!.email, name: member!.name },
    });
  },
);

// DELETE /projects/:projectId/members/:userId
app.delete("/projects/:projectId/members/:userId", requireAuth, async (c) => {
  const { userId } = c.var;
  const { projectId, userId: targetUserId } = c.req.param();

  const callerRole = await getEffectiveProjectRole(
    c.env.MAIN_DB,
    userId,
    projectId,
  );
  assertProjectRole(callerRole, "project_admin");

  await c.env.MAIN_DB.prepare(
    `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`,
  )
    .bind(projectId, targetUserId)
    .run();

  return c.body(null, 204);
});

// ─── Invitations (token-based) ────────────────────────────────────────────────

// GET /invitations/:token — public lookup (no auth)
app.get("/invitations/:token", async (c) => {
  const { token } = c.req.param();

  const inv = await c.env.MAIN_DB.prepare(
    `SELECT i.*, p.name AS project_name, u.name AS inviter_name
     FROM invitations i
     LEFT JOIN projects p ON p.id = i.project_id
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.token = ?`,
  )
    .bind(token)
    .first<
      DbInvitation & {
        project_name: string | null;
        inviter_name: string | null;
      }
    >();

  if (!inv)
    return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);

  const now = Math.floor(Date.now() / 1000);
  if (inv.expires_at < now) {
    return c.json({ error: "Invitation has expired", code: "EXPIRED" }, 410);
  }

  return c.json({
    id: inv.id,
    projectId: inv.project_id,
    accountId: inv.account_id,
    email: inv.email,
    role: inv.role,
    invitedBy: inv.invited_by,
    token: inv.token,
    expiresAt: inv.expires_at,
    acceptedAt: inv.accepted_at,
    projectName: inv.project_name,
    inviterName: inv.inviter_name,
  });
});

// POST /invitations/:token/accept
app.post("/invitations/:token/accept", requireAuth, async (c) => {
  const { userId } = c.var;
  const { token } = c.req.param();

  const inv = await c.env.MAIN_DB.prepare(
    `SELECT * FROM invitations WHERE token = ?`,
  )
    .bind(token)
    .first<DbInvitation>();

  if (!inv)
    return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);

  const user = await c.env.MAIN_DB.prepare(
    `SELECT email FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ email: string }>();
  if (!user || user.email.toLowerCase() !== inv.email.toLowerCase())
    return c.json(
      {
        error: "Invitation belongs to another email address",
        code: "FORBIDDEN",
      },
      403,
    );
  const now = Math.floor(Date.now() / 1000);
  if (inv.expires_at < now) {
    return c.json({ error: "Invitation has expired", code: "EXPIRED" }, 410);
  }
  if (inv.accepted_at !== null) {
    return c.json(
      { error: "Invitation already accepted", code: "ALREADY_ACCEPTED" },
      410,
    );
  }

  const role = inv.role as
    | "project_admin"
    | "editor"
    | "writer"
    | "account_admin"
    | "account_editor";

  const stmts = [
    // Mark invitation accepted
    c.env.MAIN_DB.prepare(
      `UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL`,
    ).bind(now, inv.id),
  ];

  if (inv.project_id) {
    stmts.push(
      c.env.MAIN_DB.prepare(
        `INSERT OR IGNORE INTO project_members
         (project_id, user_id, role, invited_by, joined_at, invited_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        inv.project_id,
        userId,
        role,
        inv.invited_by,
        now,
        inv.expires_at - 7 * 24 * 60 * 60,
      ),
    );
  } else if (inv.account_id) {
    stmts.push(
      c.env.MAIN_DB.prepare(
        `INSERT OR IGNORE INTO account_members
         (account_id, user_id, role, invited_by, joined_at, invited_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        inv.account_id,
        userId,
        role,
        inv.invited_by,
        now,
        inv.expires_at - 7 * 24 * 60 * 60,
      ),
    );
  }

  await c.env.MAIN_DB.batch(stmts);

  return c.json({
    success: true,
    projectId: inv.project_id,
    accountId: inv.account_id,
  });
});

export default app;
