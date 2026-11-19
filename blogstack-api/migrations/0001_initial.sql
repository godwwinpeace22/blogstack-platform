-- Migration 0001: Initial schema
-- Apply: wrangler d1 migrations apply MAIN_DB --local
--        wrangler d1 migrations apply MAIN_DB --remote

PRAGMA foreign_keys = ON;

-- ── Users ─────────────────────────────────────────────────────────────────
-- Unified user table: Better Auth writes here directly (no separate "user"
-- table) *and* it holds app-specific fields.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT    PRIMARY KEY,
  email          TEXT    NOT NULL UNIQUE,
  name           TEXT,
  image          TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ── Accounts ──────────────────────────────────────────────────────────────
-- One account per owner. Billing happens at the account level.

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  plan       TEXT NOT NULL DEFAULT 'hobby' CHECK(plan IN ('hobby', 'pro', 'team')),
  stripe_id  TEXT,
  created_at INTEGER NOT NULL
);

-- ── Projects ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Settings stored as JSON column for flexibility
  settings   TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

-- ── Account Members ───────────────────────────────────────────────────────
-- Internal team (agency staff). Can access all projects under the account.

CREATE TABLE IF NOT EXISTS account_members (
  account_id  TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK(role IN ('account_admin', 'account_editor')),
  invited_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invited_at  INTEGER NOT NULL,
  joined_at   INTEGER,
  PRIMARY KEY (account_id, user_id)
);

-- ── Project Members ───────────────────────────────────────────────────────
-- External collaborators (clients). Scoped to a single project.

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK(role IN ('project_admin', 'editor', 'writer')),
  invited_by TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invited_at INTEGER NOT NULL,
  joined_at  INTEGER,
  PRIMARY KEY (project_id, user_id)
);

-- ── Invitations ───────────────────────────────────────────────────────────
-- Token-based invite flow. Exactly one of project_id or account_id must be set.

CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT    PRIMARY KEY,
  project_id  TEXT    REFERENCES projects(id) ON DELETE CASCADE,
  account_id  TEXT    REFERENCES accounts(id) ON DELETE CASCADE,
  email       TEXT    NOT NULL,
  role        TEXT    NOT NULL,
  invited_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token       TEXT    NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER,
  CHECK(
    (project_id IS NOT NULL AND account_id IS NULL) OR
    (project_id IS NULL AND account_id IS NOT NULL)
  )
);

-- ── Posts ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT    PRIMARY KEY,
  project_id    TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  slug          TEXT    NOT NULL,
  content       TEXT    NOT NULL DEFAULT '[]',  -- BlockNote JSON array
  rendered_html TEXT,                            -- Pre-rendered, Shiki highlighted
  status        TEXT    NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'published', 'scheduled')),
  author_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at  INTEGER,
  scheduled_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);

-- ── Media ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media (
  id          TEXT    PRIMARY KEY,
  project_id  TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,              -- R2 object key
  url         TEXT    NOT NULL,              -- CDN base URL
  filename    TEXT    NOT NULL,
  size        INTEGER,                       -- bytes
  width       INTEGER,
  height      INTEGER,
  mime_type   TEXT,
  uploaded_by TEXT    REFERENCES users(id) ON DELETE SET NULL,
  confirmed   INTEGER NOT NULL DEFAULT 0,   -- 1 after /confirm call
  created_at  INTEGER NOT NULL
);

-- ── Tags ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  og_image    TEXT,
  UNIQUE(project_id, slug)
);

-- ── Post Tags ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_account
  ON projects(account_id);

CREATE INDEX IF NOT EXISTS idx_posts_project_status
  ON posts(project_id, status);

CREATE INDEX IF NOT EXISTS idx_posts_project_slug
  ON posts(project_id, slug);

CREATE INDEX IF NOT EXISTS idx_posts_author
  ON posts(author_id);

CREATE INDEX IF NOT EXISTS idx_posts_scheduled
  ON posts(scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_media_project
  ON media(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tags_project
  ON tags(project_id);

CREATE INDEX IF NOT EXISTS idx_account_members_user
  ON account_members(user_id);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_project_members_project
  ON project_members(project_id);

CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON invitations(token);

CREATE INDEX IF NOT EXISTS idx_invitations_email
  ON invitations(email);
