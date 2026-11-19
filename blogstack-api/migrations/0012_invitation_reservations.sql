CREATE TRIGGER launch_resend_limit BEFORE UPDATE OF expires_at ON invitations
 WHEN NEW.accepted_at IS NULL AND OLD.expires_at<=unixepoch() AND NEW.expires_at>unixepoch() BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_people WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id)) AND email=lower(NEW.email))
 AND (SELECT COUNT(*) FROM account_people WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id))) >=
 (SELECT max_people FROM account_access WHERE account_id=COALESCE(NEW.account_id,(SELECT account_id FROM projects WHERE id=NEW.project_id)))
 THEN RAISE(ABORT,'PEOPLE_LIMIT') END;
END;
