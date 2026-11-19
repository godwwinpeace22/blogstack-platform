CREATE TRIGGER launch_draft_slug BEFORE UPDATE OF slug ON post_drafts BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM post_drafts d JOIN posts p ON p.id=d.post_id
 WHERE d.post_id!=NEW.post_id AND p.project_id=(SELECT project_id FROM posts WHERE id=NEW.post_id)
 AND (d.slug=NEW.slug OR p.slug=NEW.slug)) THEN RAISE(ABORT,'SLUG_CONFLICT') END;
END;
