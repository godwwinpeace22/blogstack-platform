# BlogStack backup and restore

Backups must be independently restorable before charging. D1 and R2 hold different parts of the product; restoring only database rows does not restore article images.

## Backup

Recurring production SQL/media backups, retention and delivered alerts are deployed and verified; see [OPERATIONS.md](OPERATIONS.md) for schedules, recovery commands, credential expiry and the actual protection boundary. The automated bucket is separate from live media but remains in the same Cloudflare account. An additional provider/account is not configured.

Run node scripts/backup.mjs before each migration for an additional manual SQL export in artifacts/backups. Local drills can use --local after setup:local. That path verifies a separately restored in-memory database, including views, entitlement triggers and foreign keys. Treat exports as private: they include email addresses, sessions, draft content, billing references and API-key hashes.

The backup command also accepts --config path and --output path for explicitly isolated drills. The November 19 drill used .launch/sandbox.app.wrangler.json and restored into .launch/recovery.app.wrangler.json, never the main BlogStack database. Recovery resources have no email, payment, AI, queue or cron bindings. Restored Better Auth tables are named session and verification (singular); revoke their rows in the recovery database before testing new sign-ins. Record counts and integrity checks use bounded subqueries, since D1 limits compound SELECT terms.

The automated bucket uses R2 encryption at rest and retains daily/manual SQL copies for 30 days and Sunday copies for 90 days. Shared media versions expire 90 days after their last reference. Encrypt any downloaded copies before sharing or placing them in additional storage. Restrict operator access. Keep an external copy of deployment configuration, migration version, package versions and secret-recovery instructions. Do not put secret values in a public manifest.

Use node scripts/backup-media.mjs to preview configuration, then --apply to copy R2 objects to a separate recovery bucket or independent S3-compatible account, with an object manifest containing key, size and checksum. The script copies all objects, including pending uploads present during the snapshot, and verifies destination size/checksum metadata. Use an authenticated provider tool with read-only source credentials; do not rely on public CDN URLs because delivery may pause. The operator must provision this independent destination and retention job.

## Restoration drill

1. Choose a backup and record its creation time and the last successful object copy.
2. Create a separate D1 database and recovery bucket. Never import a drill into live production.
3. Import the SQL export using wrangler d1 execute RECOVERY_DB --remote --file backup.sql with a recovery-only configuration.
4. Restore the matching R2 objects to the recovery bucket and compare manifest checksums and counts.
5. Deploy an isolated recovery API/CDN using the restored resources and separate credentials/URLs. Use Polar sandbox or disable checkout and outbound notifications while inspecting restored payment state.
6. Revoke restored user sessions and replace authentication/upload secrets in the isolated environment. Verify API-key hashes remain scoped; never expose recovered drafts publicly.
7. Verify a published article, private draft, media image, tags, SEO fields, account roles and export. Verify account_access/account_people views and launch entitlement triggers exist. Run PRAGMA foreign_key_check and compare row counts for projects, posts, drafts, media, account_billing and paid_orders.
8. Simulate expiration to verify retained exports and tombstone cleanup. Do not run real email, payment or deletion jobs against live services from a restored snapshot.
9. Record achieved recovery-point and recovery-time measurements, the backup IDs and the operator. Only then set RESTORE_DRILL_PASSED=true.

## Production incident

Pause new checkout and editing while deciding the recovery point. Preserve current database/object evidence before restoring anything. Restore into separate resources, validate, then switch API/CDN bindings together. Use provider reconciliation to recover payment events after the backup timestamp; do not reconstruct entitlements from legacy plan labels.

After recovery, restart outbox processing carefully and inspect pending/failed jobs, usage reservations, R2 deletions and lifecycle notices. Confirm public metadata, media and client exports before reopening editing and checkout.

Production secret changes, data restoration and endpoint switching require an operator review of the concrete recovery target. A successful local restore does not establish that production backups or independent media copies exist.
