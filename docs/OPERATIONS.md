# Production operations

Verified November 19, 2026. Hosting remains on Cloudflare Workers Free, with managed workers.dev URLs. Polar is on hold and checkout is disabled.

## Owner controls

Open `/operations` in the main BlogStack dashboard, signed in as the verified hello@boldlaunchstudio.com owner. This route checks the real user session and verified operator email, rejects API keys and checks origins for mutations. It remains usable after trial expiry. Ordinary customer accounts cannot access it. The underlying `blogstack-ops` worker has no public route and accepts only a private service binding.

The page shows service health, scheduled heartbeat, completed/running backups and labeled incident/recovery delivery tests. Manual controls use the same deployed queue and providers as scheduled work.

## Scheduled backups

The worker's five-minute cron records a heartbeat and schedules health/retention jobs. It starts the daily snapshot at 03:00 WAT (UTC+1), catching up on the next invocation if that tick is missed. Sunday snapshots are weekly copies. Progress, leases and retries live in the separate operations D1 database. Queue continuations bound external calls and media copies for the Free plan; a snapshot must finish within six hours.

D1 exports go to the private `blogstack-backups` R2 bucket as SQL. Media objects are copied incrementally by source key/MD5 ETag, with destination size and checksum checks. Unchanged media versions are reused. A completion manifest is written only after SQL and every media page pass validation. Partial failures never replace completed backups.

Daily and manual SQL snapshots expire after 30 days; Sunday snapshots after 90 days. Shared media versions expire 90 days after their latest snapshot reference. Retention runs automatically and never deletes source data. Main media is removed from delivery immediately, with a 48-hour physical deletion grace so a bounded backup can finish safely. Cleanup is bounded per lifecycle invocation.

R2 encrypts backups at rest. The backup bucket is separate from live media but belongs to the same Cloudflare account, so it does not protect against loss of that account. An additional provider/account has not been configured. Keep a private downloaded recovery copy and configuration outside Cloudflare for additional protection.

The approved backup credential has D1 Write across hello@wordman.app's account because Cloudflare's SQL-export endpoint requires it. This permission also permits database changes; it is not a read-only credential. It has no Workers, DNS, R2, billing or Polar API permission. It is stored only in private launch files and the operations worker. It expires November 19, 2027. The existing analytics-read credential expires February 16, 2027. The monitor warns within 30 days of expiry. Never put either credential into customer code.

## Download and recovery

Use an authorized Cloudflare login and the root launcher:

```sh
node scripts/download-operations-backup.mjs --snapshot SNAPSHOT_UUID --kind daily --directory /new/private/recovery-directory
```

Use the actual `daily`, `weekly` or `manual` kind. The full ID is in operations D1's `backup_runs` table. The destination must not exist. The command downloads only a completed manifest's SQL/media keys, handles literal percent characters in object names, validates every MD5/size and records SHA-256. It creates restricted files and never imports or changes a live database. Keep SQL, media and `verified.json` private.

Follow [RESTORE.md](RESTORE.md) to provision a separate recovery database, bucket and cache. Import there, revoke recovered `session`, `verification` and API-key rows, rotate recovery auth/upload secrets and leave outbound credentials, queues, cron and private service bindings absent. Never point a drill at live resources.

Snapshot `2fc3d509-0de8-4a99-ba93-441efb60f245` completed in nine seconds and was restored into fresh `blogstack-production-recovery-db` and `blogstack-production-recovery-media` resources. Its 63,276-byte SQL and 55,239-byte confirmed image passed checksums. Native D1/HTTP checks verified the published article, newer separate private draft, metadata, tags, 23 entitlement triggers, both access views, zero foreign-key violations, revoked sessions and denied anonymous draft/export access. Recovered CDN image SHA-256 matched the snapshot. The 651-second exercise includes resource setup and download troubleshooting; it is not a recovery SLA. Evidence: `artifacts/verification/production-automated-backup-restore.json`.

## Alerts

Every five minutes the worker checks actual API/site/docs/registry/article responses; sampled Worker error estimates over 15 minutes; failed/stalled/overdue jobs and email jobs; delayed media cleanup; queue backlog, age and dead letters; stale/failed backups; and credential expiry. Blocked external dependencies are reported as operational issues without customer content.

Email goes through the approved domain-restricted Resend sender to hello@boldlaunchstudio.com. The monitor sends when the issue-code set changes, then one recovery message when it clears. Unchanged issues stay quiet. Events are persisted before sending, so concurrent checks and retries use the same provider idempotency key and message. Labeled incident/recovery delivery tests both received Resend `delivered` events. Evidence: `artifacts/verification/operations-alert-delivery.json`.

The monitor shares the app's Cloudflare account. It cannot provide an independent alarm during a total Cloudflare/account outage. No external uptime provider has been represented as configured. `node scripts/launch.mjs operations` remains a manual database-only diagnostic.
