CREATE UNIQUE INDEX launch_one_active_scan ON link_checks(project_id) WHERE status IN ('queued','running');
