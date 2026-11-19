-- Migration 0003: Webhooks
-- events column is a JSON array of WebhookEvent strings.
-- secret is used to sign payloads with HMAC-SHA256 in the ingest worker.

CREATE TABLE IF NOT EXISTS webhooks (
  id         TEXT    PRIMARY KEY,
  project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  events     TEXT    NOT NULL DEFAULT '[]',   -- JSON: ["post.published", ...]
  secret     TEXT    NOT NULL,                -- HMAC signing secret
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_project
  ON webhooks(project_id);
