-- Migration 0005: Better Auth core tables
-- The "users" table is defined in 0001_initial.sql (merged with app schema).
-- Better Auth is configured to use "users" (plural) via auth-schema.ts.

CREATE TABLE IF NOT EXISTS "session" (
  id          TEXT    PRIMARY KEY,
  expires_at  INTEGER NOT NULL,
  token       TEXT    NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id                          TEXT    PRIMARY KEY,
  account_id                  TEXT    NOT NULL,
  provider_id                 TEXT    NOT NULL,
  user_id                     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token                TEXT,
  refresh_token               TEXT,
  id_token                    TEXT,
  access_token_expires_at     INTEGER,
  refresh_token_expires_at    INTEGER,
  scope                       TEXT,
  password                    TEXT,
  created_at                  INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  id         TEXT    PRIMARY KEY,
  identifier TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ba_session_token
  ON "session"(token);

CREATE INDEX IF NOT EXISTS idx_ba_session_user
  ON "session"(user_id);

CREATE INDEX IF NOT EXISTS idx_ba_account_user
  ON "account"(user_id);

CREATE INDEX IF NOT EXISTS idx_ba_user_email
  ON users(email);
