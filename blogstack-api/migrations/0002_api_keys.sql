-- Migration 0002: API keys
-- SHA-256 hash stored, plaintext returned once on creation.

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  key_hash     TEXT    NOT NULL UNIQUE,  -- SHA-256 of the plaintext key
  key_prefix   TEXT    NOT NULL,         -- First 8 chars for display (bsk_live)
  created_by   TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project
  ON api_keys(project_id);

-- Hash lookup index for X-API-Key auth middleware
CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys(key_hash);
