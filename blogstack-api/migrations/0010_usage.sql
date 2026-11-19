CREATE TRIGGER launch_usage_guard BEFORE INSERT ON usage_reservations BEGIN
 SELECT CASE WHEN NEW.reserved<=0 OR NEW.metric NOT IN ('ai','links') THEN RAISE(ABORT,'INVALID_USAGE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_access WHERE account_id=NEW.account_id AND writable=1) THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
 SELECT CASE WHEN COALESCE((SELECT used FROM usage_counters WHERE account_id=NEW.account_id AND period_start=NEW.period_start AND metric=NEW.metric),0)+NEW.reserved >
 (SELECT CASE WHEN NEW.metric='ai' THEN ai_credits ELSE link_checks END FROM account_access WHERE account_id=NEW.account_id)
 THEN RAISE(ABORT,'USAGE_LIMIT') END;
END;
CREATE TRIGGER launch_usage_reserve AFTER INSERT ON usage_reservations BEGIN
 INSERT INTO usage_counters(account_id,period_start,metric,used) VALUES(NEW.account_id,NEW.period_start,NEW.metric,NEW.reserved)
 ON CONFLICT(account_id,period_start,metric) DO UPDATE SET used=used+NEW.reserved;
END;
CREATE TRIGGER launch_usage_settle AFTER UPDATE OF settled ON usage_reservations WHEN OLD.settled=0 AND NEW.settled=1 BEGIN
 UPDATE usage_counters SET used=used-OLD.reserved+NEW.reserved
 WHERE account_id=NEW.account_id AND period_start=NEW.period_start AND metric=NEW.metric;
END;
