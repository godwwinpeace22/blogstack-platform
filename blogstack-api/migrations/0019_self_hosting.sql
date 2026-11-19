-- Hosted remains the default. Only an operator with database access can select
-- self-hosting; request headers, account roles and legacy plan labels cannot.
CREATE TABLE deployment_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL DEFAULT 'hosted' CHECK(mode IN ('hosted','self_hosted')),
  max_blogs INTEGER CHECK(max_blogs IS NULL OR max_blogs>0),
  max_people INTEGER NOT NULL DEFAULT 100 CHECK(max_people>0),
  storage_bytes INTEGER NOT NULL DEFAULT 100000000000 CHECK(storage_bytes>0),
  ai_credits INTEGER NOT NULL DEFAULT 500 CHECK(ai_credits>=0),
  link_checks INTEGER NOT NULL DEFAULT 25000 CHECK(link_checks>=0),
  analytics_days INTEGER NOT NULL DEFAULT 365 CHECK(analytics_days BETWEEN 1 AND 3650),
  max_posts INTEGER NOT NULL DEFAULT 10000 CHECK(max_posts>0),
  audit_days INTEGER NOT NULL DEFAULT 1 CHECK(audit_days>0)
);
INSERT INTO deployment_settings(id) VALUES(1);

DROP VIEW account_access;
CREATE VIEW account_access AS
 SELECT b.*,
 CASE WHEN d.mode='self_hosted' THEN d.max_blogs
   WHEN p.max_blogs IS NOT NULL AND (l.max_blogs IS NULL OR p.max_blogs<l.max_blogs) THEN p.max_blogs ELSE l.max_blogs END AS max_blogs,
 CASE WHEN d.mode='self_hosted' THEN d.max_people ELSE MIN(l.max_people,COALESCE(p.max_people,l.max_people)) END AS max_people,
 CASE WHEN d.mode='self_hosted' THEN d.storage_bytes ELSE MIN(l.storage_bytes,COALESCE(p.storage_bytes,l.storage_bytes)) END AS storage_bytes,
 CASE WHEN d.mode='self_hosted' THEN d.ai_credits ELSE l.ai_credits END AS ai_credits,
 CASE WHEN d.mode='self_hosted' THEN d.link_checks ELSE l.link_checks END AS link_checks,
 CASE WHEN d.mode='self_hosted' THEN d.analytics_days ELSE l.analytics_days END AS analytics_days,
 CASE WHEN d.mode='self_hosted' THEN d.max_posts ELSE 1000 END AS max_posts,
 CASE WHEN d.mode='self_hosted' THEN d.audit_days WHEN b.plan='growth' THEN 1 WHEN b.plan='studio' THEN 7 END AS audit_days,
 d.mode='self_hosted' AS self_hosted,
 CASE WHEN d.mode='self_hosted' OR b.internal_access=1 THEN 0 ELSE MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0)) END AS access_until,
 b.purged_at IS NULL AND (d.mode='self_hosted' OR b.internal_access=1 OR MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))>unixepoch()) AS writable,
 b.purged_at IS NULL AND (d.mode='self_hosted' OR b.internal_access=1 OR MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))+2592000>unixepoch()) AS public_delivery
 FROM account_billing b JOIN launch_plans l ON l.id=b.plan
 LEFT JOIN launch_plans p ON p.id=b.pending_plan CROSS JOIN deployment_settings d;

DROP TRIGGER launch_start_trial;
CREATE TRIGGER launch_start_trial AFTER INSERT ON projects
 WHEN (SELECT mode FROM deployment_settings WHERE id=1)='hosted' BEGIN
 UPDATE account_billing SET trial_started_at=unixepoch(),trial_ends_at=unixepoch()+1209600,
 period_anchor=unixepoch(),updated_at=unixepoch()
 WHERE account_id=NEW.account_id AND trial_started_at IS NULL;
END;

DROP TRIGGER launch_post_limit;
CREATE TRIGGER launch_post_limit BEFORE INSERT ON posts BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM posts WHERE project_id=NEW.project_id)>=
 (SELECT a.max_posts FROM account_access a JOIN projects p ON p.account_id=a.account_id WHERE p.id=NEW.project_id)
 THEN RAISE(ABORT,'POST_LIMIT') END;
END;
