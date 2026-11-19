-- Migration 0004: Analytics
-- Privacy-first: no PII. visitor_id is an anonymous fingerprint (hashed IP+UA).
-- Deduplication: one view per visitor per post per hour, enforced in ingest worker.

CREATE TABLE IF NOT EXISTS post_views (
  id         TEXT    PRIMARY KEY,
  post_id    TEXT    NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_id TEXT    NOT NULL,  -- anonymous fingerprint, never PII
  referrer   TEXT,
  country    TEXT,              -- 2-letter ISO code from CF-IPCountry header
  ua         TEXT,              -- truncated user agent string
  viewed_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_views_post
  ON post_views(post_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_views_project
  ON post_views(project_id, viewed_at DESC);

-- Used by ingest worker to deduplicate within a 1-hour window
CREATE INDEX IF NOT EXISTS idx_post_views_dedup
  ON post_views(post_id, visitor_id, viewed_at DESC);
