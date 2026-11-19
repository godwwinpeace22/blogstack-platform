"""Validate a Cloudflare D1 SQL backup in an isolated, in-memory database."""
import json
from pathlib import Path
import sqlite3
import sys
restored = sqlite3.connect(":memory:")
restored.executescript(Path(sys.argv[1]).read_text())
counts = {table: restored.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
          for table in ["users", "projects", "posts", "post_drafts", "media", "account_billing"]}
guards = restored.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'launch_%'").fetchone()[0]
views = restored.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name IN ('account_access','account_people')").fetchone()[0]
foreign = restored.execute("PRAGMA foreign_key_check").fetchall()
if guards < 12 or views != 2 or foreign:
    raise SystemExit("Restoration failed entitlement schema or foreign-key checks.")
print(json.dumps({"counts": counts, "entitlementTriggers": guards,
                  "entitlementViews": views, "foreignKeyViolations": len(foreign)}, indent=2))
restored.close()
