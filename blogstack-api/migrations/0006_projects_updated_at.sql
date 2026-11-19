-- Migration 0006: Project update timestamp
-- `routes/projects.ts` updates this column, but it was absent from the initial
-- schema. Backfill existing projects with their creation timestamp so the
-- column remains non-null after rollout.

ALTER TABLE projects ADD COLUMN updated_at INTEGER;

UPDATE projects
SET updated_at = created_at
WHERE updated_at IS NULL;
