-- Reserve resource allowances for a scheduled downgrade, so usage cannot grow
-- past the destination plan between scheduling and renewal.
DROP VIEW account_access;
CREATE VIEW account_access AS
 SELECT b.*,
 CASE WHEN p.max_blogs IS NOT NULL AND (l.max_blogs IS NULL OR p.max_blogs<l.max_blogs) THEN p.max_blogs ELSE l.max_blogs END AS max_blogs,
 MIN(l.max_people,COALESCE(p.max_people,l.max_people)) AS max_people,
 MIN(l.storage_bytes,COALESCE(p.storage_bytes,l.storage_bytes)) AS storage_bytes,
 l.ai_credits,l.link_checks,l.analytics_days,
 MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0)) AS access_until,
 b.purged_at IS NULL AND MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))>unixepoch() AS writable,
 b.purged_at IS NULL AND MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))+2592000>unixepoch() AS public_delivery
 FROM account_billing b JOIN launch_plans l ON l.id=b.plan LEFT JOIN launch_plans p ON p.id=b.pending_plan;
CREATE TRIGGER launch_downgrade_guard BEFORE UPDATE OF pending_plan ON account_billing WHEN NEW.pending_plan IS NOT NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM launch_plans p WHERE p.id=NEW.pending_plan AND p.max_blogs IS NOT NULL AND
  (SELECT COUNT(*) FROM projects WHERE account_id=NEW.account_id)>p.max_blogs) THEN RAISE(ABORT,'BLOG_LIMIT') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM account_people WHERE account_id=NEW.account_id)>(SELECT max_people FROM launch_plans WHERE id=NEW.pending_plan) THEN RAISE(ABORT,'PEOPLE_LIMIT') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(CASE WHEN m.confirmed=1 THEN COALESCE(m.size,0) ELSE m.reserved_size END) FROM media m JOIN projects p ON p.id=m.project_id
 WHERE p.account_id=NEW.account_id AND (m.confirmed=1 OR m.reservation_expires_at>unixepoch())),0)>(SELECT storage_bytes FROM launch_plans WHERE id=NEW.pending_plan)
 THEN RAISE(ABORT,'STORAGE_LIMIT') END;
END;
