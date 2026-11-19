ALTER TABLE post_links ADD COLUMN normalized_url TEXT NOT NULL DEFAULT '';
UPDATE post_links SET normalized_url=rtrim(substr(url,1,MIN(COALESCE(NULLIF(instr(url,'?'),0),length(url)+1),COALESCE(NULLIF(instr(url,'#'),0),length(url)+1))-1),'/');
CREATE TRIGGER launch_link_normalize_insert AFTER INSERT ON post_links BEGIN
 UPDATE post_links SET normalized_url=rtrim(substr(url,1,MIN(COALESCE(NULLIF(instr(url,'?'),0),length(url)+1),COALESCE(NULLIF(instr(url,'#'),0),length(url)+1))-1),'/') WHERE id=NEW.id;
END;
CREATE TRIGGER launch_link_normalize_update AFTER UPDATE OF url ON post_links BEGIN
 UPDATE post_links SET normalized_url=rtrim(substr(url,1,MIN(COALESCE(NULLIF(instr(url,'?'),0),length(url)+1),COALESCE(NULLIF(instr(url,'#'),0),length(url)+1))-1),'/') WHERE id=NEW.id;
END;
CREATE INDEX launch_link_incoming ON post_links(project_id,normalized_url,post_id);
