-- Additive launch migration. Legacy accounts.plan is retained for compatibility,
-- but never participates in authorization or paid entitlements.
CREATE TABLE launch_plans (
  id TEXT PRIMARY KEY CHECK(id IN ('solo','studio','growth')),
  max_blogs INTEGER, max_people INTEGER NOT NULL, storage_bytes INTEGER NOT NULL,
  ai_credits INTEGER NOT NULL, link_checks INTEGER NOT NULL, analytics_days INTEGER NOT NULL
);
INSERT INTO launch_plans VALUES
 ('solo',1,2,1000000000,10,100,30),
 ('studio',NULL,10,5000000000,100,2500,180),
 ('growth',NULL,20,100000000000,500,25000,365);
CREATE TABLE account_billing (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'studio' REFERENCES launch_plans(id),
  interval TEXT CHECK(interval IN ('month','year')),
  trial_started_at INTEGER, trial_ends_at INTEGER, paid_through INTEGER,
  provider_customer_id TEXT UNIQUE, provider_subscription_id TEXT UNIQUE,
  provider_status TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  period_anchor INTEGER, pending_plan TEXT, pending_interval TEXT,
  purged_at INTEGER, updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
INSERT INTO account_billing(account_id,trial_started_at,trial_ends_at)
 SELECT a.id,CASE WHEN EXISTS(SELECT 1 FROM projects p WHERE p.account_id=a.id) THEN unixepoch() END,
 CASE WHEN EXISTS(SELECT 1 FROM projects p WHERE p.account_id=a.id) THEN unixepoch()+1209600 END FROM accounts a;
CREATE TRIGGER launch_account AFTER INSERT ON accounts BEGIN
 INSERT INTO account_billing(account_id) VALUES(NEW.id);
END;
CREATE VIEW account_access AS
 SELECT b.*, l.max_blogs,l.max_people,l.storage_bytes,l.ai_credits,l.link_checks,l.analytics_days,
 MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0)) AS access_until,
 b.purged_at IS NULL AND MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))>unixepoch() AS writable,
 b.purged_at IS NULL AND MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))+2592000>unixepoch() AS public_delivery
 FROM account_billing b JOIN launch_plans l ON l.id=b.plan;
CREATE TRIGGER launch_blog_limit BEFORE INSERT ON projects BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_access b WHERE b.account_id=NEW.account_id AND
   (b.writable=1 OR (b.trial_started_at IS NULL AND b.purged_at IS NULL)))
   THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM account_access b WHERE b.account_id=NEW.account_id AND b.max_blogs IS NOT NULL AND
   (SELECT COUNT(*) FROM projects p WHERE p.account_id=NEW.account_id)>=b.max_blogs)
   THEN RAISE(ABORT,'BLOG_LIMIT') END;
END;
CREATE TRIGGER launch_start_trial AFTER INSERT ON projects BEGIN
 UPDATE account_billing SET trial_started_at=unixepoch(),trial_ends_at=unixepoch()+1209600,
 period_anchor=unixepoch(),updated_at=unixepoch()
 WHERE account_id=NEW.account_id AND trial_started_at IS NULL;
END;
CREATE VIEW account_people AS
 SELECT a.id AS account_id,lower(u.email) AS email FROM accounts a JOIN users u ON u.id=a.owner_id
 UNION SELECT am.account_id,lower(u.email) FROM account_members am JOIN users u ON u.id=am.user_id
 UNION SELECT p.account_id,lower(u.email) FROM project_members pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=pm.user_id
 UNION SELECT COALESCE(i.account_id,p.account_id),lower(i.email) FROM invitations i LEFT JOIN projects p ON p.id=i.project_id
 WHERE i.accepted_at IS NULL AND i.expires_at>unixepoch();
CREATE TRIGGER launch_invite_limit BEFORE INSERT ON invitations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_access b WHERE b.account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id)) AND b.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_people WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id)) AND email=lower(NEW.email))
 AND (SELECT COUNT(*) FROM account_people WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id))) >=
 (SELECT max_people FROM account_access WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id)))
 THEN RAISE(ABORT,'PEOPLE_LIMIT') END;
END;
CREATE TRIGGER launch_account_member_limit BEFORE INSERT ON account_members BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_people WHERE account_id=NEW.account_id AND email=(SELECT lower(email) FROM users WHERE id=NEW.user_id))
 AND (SELECT COUNT(*) FROM account_people WHERE account_id=NEW.account_id)>=(SELECT max_people FROM account_access WHERE account_id=NEW.account_id)
 THEN RAISE(ABORT,'PEOPLE_LIMIT') END;
END;
CREATE TRIGGER launch_project_member_limit BEFORE INSERT ON project_members BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_people WHERE account_id=(SELECT account_id FROM projects WHERE id=NEW.project_id) AND email=(SELECT lower(email) FROM users WHERE id=NEW.user_id))
 AND (SELECT COUNT(*) FROM account_people WHERE account_id=(SELECT account_id FROM projects WHERE id=NEW.project_id))>=(SELECT max_people FROM account_access WHERE account_id=(SELECT account_id FROM projects WHERE id=NEW.project_id))
 THEN RAISE(ABORT,'PEOPLE_LIMIT') END;
END;

ALTER TABLE posts ADD COLUMN excerpt TEXT;
ALTER TABLE posts ADD COLUMN cover_image TEXT;
ALTER TABLE posts ADD COLUMN seo_title TEXT;
ALTER TABLE posts ADD COLUMN seo_description TEXT;
ALTER TABLE posts ADD COLUMN canonical_url TEXT;
ALTER TABLE posts ADD COLUMN no_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN primary_keyword TEXT;
ALTER TABLE posts ADD COLUMN published_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN ever_published INTEGER NOT NULL DEFAULT 0;
UPDATE posts SET ever_published=1,published_revision=1 WHERE status='published';
UPDATE posts SET status='draft',scheduled_at=NULL WHERE status='scheduled';
CREATE TABLE post_drafts (
 post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 title TEXT NOT NULL,slug TEXT NOT NULL,content TEXT NOT NULL DEFAULT '[]',
 excerpt TEXT,cover_image TEXT,seo_title TEXT,seo_description TEXT,canonical_url TEXT,
 no_index INTEGER NOT NULL DEFAULT 0,primary_keyword TEXT,
 tag_ids TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 1,
 mutation_id TEXT,updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
INSERT INTO post_drafts(post_id,title,slug,content,tag_ids)
 SELECT p.id,p.title,p.slug,p.content,COALESCE((SELECT json_group_array(tag_id) FROM post_tags WHERE post_id=p.id),'[]') FROM posts p;
CREATE TRIGGER launch_post_draft AFTER INSERT ON posts BEGIN
 INSERT INTO post_drafts(post_id,title,slug,content) VALUES(NEW.id,NEW.title,NEW.slug,NEW.content);
END;
CREATE TRIGGER launch_post_limit BEFORE INSERT ON posts BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM posts WHERE project_id=NEW.project_id)>=1000
 THEN RAISE(ABORT,'POST_LIMIT') END;
END;

ALTER TABLE media ADD COLUMN reserved_size INTEGER NOT NULL DEFAULT 10485760;
ALTER TABLE media ADD COLUMN reservation_expires_at INTEGER;
CREATE TABLE r2_deletions(key TEXT PRIMARY KEY,media_id TEXT,created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TRIGGER launch_media_limit BEFORE INSERT ON media BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_access a JOIN projects p ON p.account_id=a.account_id WHERE p.id=NEW.project_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
 SELECT CASE WHEN NEW.reserved_size<=0 OR NEW.reserved_size>10485760 THEN RAISE(ABORT,'UPLOAD_SIZE') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(CASE WHEN m.confirmed=1 THEN COALESCE(m.size,0) ELSE m.reserved_size END)
 FROM media m JOIN projects p ON p.id=m.project_id WHERE p.account_id=(SELECT account_id FROM projects WHERE id=NEW.project_id)
 AND (m.confirmed=1 OR COALESCE(m.reservation_expires_at,0)>unixepoch())),0)+NEW.reserved_size >
 (SELECT a.storage_bytes FROM account_access a JOIN projects p ON p.account_id=a.account_id WHERE p.id=NEW.project_id)
 THEN RAISE(ABORT,'STORAGE_LIMIT') END;
END;
CREATE TRIGGER launch_media_cleanup AFTER DELETE ON media BEGIN
 INSERT OR IGNORE INTO r2_deletions(key,media_id) VALUES(OLD.key,OLD.id);
END;
CREATE TABLE usage_counters (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, period_start INTEGER NOT NULL,
 metric TEXT NOT NULL CHECK(metric IN ('ai','links')), used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
 PRIMARY KEY(account_id,period_start,metric)
);
CREATE TABLE usage_reservations (
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,period_start INTEGER NOT NULL,
 metric TEXT NOT NULL,reserved INTEGER NOT NULL,settled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE background_jobs (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,available_at INTEGER NOT NULL DEFAULT(unixepoch()),lease_until INTEGER,
 last_error TEXT,created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX background_jobs_pending ON background_jobs(status,available_at);
CREATE TABLE payment_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,received_at INTEGER NOT NULL DEFAULT(unixepoch()),processed_at INTEGER);
CREATE TABLE paid_orders (
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),subscription_id TEXT,
 plan TEXT NOT NULL,interval TEXT NOT NULL,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,
 refunded INTEGER NOT NULL DEFAULT 0,paid_at INTEGER NOT NULL
);
CREATE TABLE lifecycle_notices (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,kind TEXT NOT NULL,access_until INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),PRIMARY KEY(account_id,kind,access_until)
);
CREATE TABLE post_links (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,url TEXT NOT NULL,anchor TEXT NOT NULL,kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'unchecked',http_status INTEGER,final_url TEXT,checked_at INTEGER,ignored INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX post_links_project ON post_links(project_id,status);
CREATE TABLE link_checks (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'queued',
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),completed_at INTEGER,checked INTEGER NOT NULL DEFAULT 0,error TEXT
);
CREATE TABLE external_link_cache(url TEXT PRIMARY KEY,status TEXT NOT NULL,http_status INTEGER,final_url TEXT,checked_at INTEGER NOT NULL);
CREATE TABLE analytics_daily (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,day TEXT NOT NULL,
 post_id TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL,dimension TEXT NOT NULL DEFAULT '',
 total REAL NOT NULL DEFAULT 0,sampled INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,day,post_id,kind,dimension)
);
CREATE TABLE agent_runs (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,created_by TEXT NOT NULL REFERENCES users(id),
 profile TEXT NOT NULL,prompt TEXT NOT NULL,base_revision INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
 input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,credits INTEGER NOT NULL DEFAULT 0,
 result TEXT,error TEXT,created_at INTEGER NOT NULL DEFAULT(unixepoch()),completed_at INTEGER
);
CREATE TABLE agent_proposals (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,base_revision INTEGER NOT NULL,changes TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',applied_revision INTEGER,reviewed_by TEXT,reviewed_at INTEGER
);
CREATE INDEX agent_runs_project ON agent_runs(project_id,created_at);
