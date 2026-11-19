ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT '["projects:read","posts:read","posts:write","media:read","media:write","tags:read","tags:write"]';
ALTER TABLE api_keys ADD COLUMN expires_at INTEGER;
ALTER TABLE api_keys ADD COLUMN revoked_at INTEGER;
CREATE INDEX idx_api_keys_active ON api_keys(key_hash) WHERE revoked_at IS NULL;
