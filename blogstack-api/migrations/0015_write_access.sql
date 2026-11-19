-- Recheck editing coverage at commit time, including requests that rendered or
-- waited for another operation after authenticating.
CREATE TRIGGER launch_post_write_access BEFORE INSERT ON posts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN account_access a ON a.account_id=p.account_id WHERE p.id=NEW.project_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
END;
CREATE TRIGGER launch_publication_write_access BEFORE UPDATE OF title,slug,content,rendered_html,excerpt,cover_image,seo_title,seo_description,canonical_url,no_index,primary_keyword,published_revision ON posts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN account_access a ON a.account_id=p.account_id WHERE p.id=NEW.project_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
END;
CREATE TRIGGER launch_draft_write_access BEFORE UPDATE ON post_drafts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM posts p JOIN projects pr ON pr.id=p.project_id JOIN account_access a ON a.account_id=pr.account_id WHERE p.id=NEW.post_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
END;
CREATE TRIGGER launch_project_write_access BEFORE UPDATE OF name,settings ON projects BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_access a WHERE a.account_id=NEW.account_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
END;
CREATE TRIGGER launch_media_confirm_access BEFORE UPDATE OF confirmed ON media WHEN NEW.confirmed=1 AND OLD.confirmed=0 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN account_access a ON a.account_id=p.account_id WHERE p.id=NEW.project_id AND a.writable=1)
 THEN RAISE(ABORT,'SUBSCRIPTION_EXPIRED') END;
END;
