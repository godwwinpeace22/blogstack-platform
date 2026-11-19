import { spawnSync } from "node:child_process";
const sql =
  "SELECT 'failed_jobs' AS metric,COUNT(*) AS count FROM background_jobs WHERE status='failed' UNION ALL SELECT 'stalled_jobs',COUNT(*) FROM background_jobs WHERE status='running' AND lease_until<unixepoch()-600 UNION ALL SELECT 'stale_r2_cleanup',COUNT(*) FROM r2_deletions WHERE created_at<unixepoch()-259200 UNION ALL SELECT 'unprocessed_payments',COUNT(*) FROM payment_events WHERE processed_at IS NULL AND received_at<unixepoch()-900";
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "MAIN_DB",
    "--remote",
    "--config",
    "blogstack-api/wrangler.toml",
    "--command",
    sql,
    "--json",
  ],
  { encoding: "utf8", env: process.env },
);
if (result.status !== 0) {
  console.error("Operations check failed: verify Cloudflare access.");
  process.exit(1);
}
const results = JSON.parse(result.stdout).flatMap((r) => r.results ?? []);
console.table(results);
if (results.some((r) => r.count > 0)) process.exitCode = 1;
