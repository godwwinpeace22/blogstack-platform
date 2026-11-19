import { HTTPException } from "hono/http-exception";
import type { AccountRole, ProjectRole } from "../types.js";

// ─── Role hierarchy tables ────────────────────────────────────────────────────

const ACCOUNT_ROLE_RANK: Record<AccountRole, number> = {
  account_admin: 2,
  account_editor: 1,
};

const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  project_admin: 3,
  editor: 2,
  writer: 1,
};

// ─── Project-level permission checks ─────────────────────────────────────────

/**
 * Returns the effective project role for a user:
 * - Direct project_members role
 * - Falls back to account_admin / account_editor access
 * - Returns null if the user has no access to the project
 */
export async function getEffectiveProjectRole(
  db: import("@cloudflare/workers-types").D1Database,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const owner = await db
    .prepare(
      `SELECT a.id FROM accounts a JOIN projects p ON p.account_id = a.id WHERE p.id = ? AND a.owner_id = ?`,
    )
    .bind(projectId, userId)
    .first();
  if (owner) return "project_admin";
  const [directRow, accountRow] = await db.batch<{ role: string }>([
    db
      .prepare(
        `SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND joined_at IS NOT NULL`,
      )
      .bind(projectId, userId),
    db
      .prepare(
        `SELECT am.role FROM account_members am JOIN projects p ON p.account_id = am.account_id WHERE p.id = ? AND am.user_id = ? AND am.joined_at IS NOT NULL`,
      )
      .bind(projectId, userId),
  ]);
  const direct = directRow?.results[0]?.role as ProjectRole | undefined;
  const inherited = accountRow?.results[0]?.role;
  const accountRole =
    inherited === "account_admin"
      ? "project_admin"
      : inherited === "account_editor"
        ? "editor"
        : null;
  return accountRole &&
    (!direct || PROJECT_ROLE_RANK[accountRole] > PROJECT_ROLE_RANK[direct])
    ? accountRole
    : (direct ?? null);
}

/**
 * Throws a 403 Response if `role` is below `required`.
 */
export function assertProjectRole(
  role: ProjectRole | null,
  required: ProjectRole,
): void {
  const rank = role ? PROJECT_ROLE_RANK[role] : 0;
  if (rank < PROJECT_ROLE_RANK[required]) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}

// ─── Account-level permission checks ─────────────────────────────────────────

export async function getAccountRole(
  db: import("@cloudflare/workers-types").D1Database,
  userId: string,
  accountId: string,
): Promise<AccountRole | "owner" | null> {
  const ownerRow = await db
    .prepare(`SELECT id FROM accounts WHERE id = ? AND owner_id = ?`)
    .bind(accountId, userId)
    .first<{ id: string }>();
  if (ownerRow) return "owner";

  const memberRow = await db
    .prepare(
      `SELECT role FROM account_members WHERE account_id = ? AND user_id = ? AND joined_at IS NOT NULL`,
    )
    .bind(accountId, userId)
    .first<{ role: AccountRole }>();

  return memberRow?.role ?? null;
}

export function assertAccountRole(
  role: AccountRole | "owner" | null,
  required: AccountRole,
): void {
  if (role === "owner") return; // owner has all permissions

  const rank = role ? ACCOUNT_ROLE_RANK[role] : 0;
  if (rank < ACCOUNT_ROLE_RANK[required]) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}
