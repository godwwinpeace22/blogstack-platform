CREATE TABLE ops_state(id TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE backup_runs(
 id TEXT PRIMARY KEY,day_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running',state TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER,
 lease_token TEXT,lease_until INTEGER,attempts INTEGER NOT NULL DEFAULT 0,error_code TEXT
);
CREATE INDEX backup_status ON backup_runs(status,updated_at);
CREATE TABLE backup_objects(
 version_key TEXT PRIMARY KEY,source_key TEXT NOT NULL,etag TEXT NOT NULL,size INTEGER NOT NULL,
 last_referenced_at INTEGER NOT NULL
);
CREATE INDEX backup_object_age ON backup_objects(last_referenced_at);
