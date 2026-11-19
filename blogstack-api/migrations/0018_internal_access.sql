-- Operator-managed internal workspaces are separate from paid coverage.
-- There is intentionally no public API for changing this flag.
ALTER TABLE account_billing ADD COLUMN internal_access INTEGER NOT NULL DEFAULT 0 CHECK(internal_access IN (0,1));
DROP VIEW account_access;
CREATE VIEW account_access AS
 SELECT b.*,
 CASE WHEN p.max_blogs IS NOT NULL AND (l.max_blogs IS NULL OR p.max_blogs<l.max_blogs) THEN p.max_blogs ELSE l.max_blogs END AS max_blogs,
 MIN(l.max_people,COALESCE(p.max_people,l.max_people)) AS max_people,
 MIN(l.storage_bytes,COALESCE(p.storage_bytes,l.storage_bytes)) AS storage_bytes,
 l.ai_credits,l.link_checks,l.analytics_days,
 CASE WHEN b.internal_access=1 THEN 0 ELSE MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0)) END AS access_until,
 b.purged_at IS NULL AND (b.internal_access=1 OR MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))>unixepoch()) AS writable,
 b.purged_at IS NULL AND (b.internal_access=1 OR MAX(COALESCE(b.paid_through,0),COALESCE(b.trial_ends_at,0))+2592000>unixepoch()) AS public_delivery
 FROM account_billing b JOIN launch_plans l ON l.id=b.plan LEFT JOIN launch_plans p ON p.id=b.pending_plan;
