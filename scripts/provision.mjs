import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const apply = process.argv.includes("--apply"),
  account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (apply && !account)
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID to the intended launch account.");
function command(args, json = false) {
  if (!apply) {
    console.log("wrangler " + args.join(" "));
    return null;
  }
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    { encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(
      "Cloudflare operation failed. Existing resources were left intact.",
    );
  }
  if (json) return JSON.parse(result.stdout);
  return result.stdout;
}
if (!apply) {
  command(["d1", "list", "--json"]);
  command(["d1", "create", "blogstack-db"]);
  command(["kv", "namespace", "create", "blogstack-cache"]);
  command(["kv", "namespace", "create", "blogstack-cdn-cache"]);
  command(["r2", "bucket", "create", "blogstack-media"]);
  command(["queues", "create", "blogstack-jobs"]);
  command(["queues", "create", "blogstack-jobs-dead"]);
  console.log(
    "Apply reuses existing named resources, then fills API/CDN resource IDs. No deployment, remote migration or secret changes are performed.",
  );
  process.exit();
}
const databases = command(["d1", "list", "--json"], true);
let database = databases.find((d) => d.name === "blogstack-db");
if (!database) {
  command(["d1", "create", "blogstack-db"]);
  database = command(["d1", "list", "--json"], true).find(
    (d) => d.name === "blogstack-db",
  );
}
let namespaces = command(["kv", "namespace", "list"], true);
for (const title of ["blogstack-cache", "blogstack-cdn-cache"]) {
  if (!namespaces.some((n) => n.title === title)) {
    command(["kv", "namespace", "create", title]);
    namespaces = command(["kv", "namespace", "list"], true);
  }
}
const buckets = command(["r2", "bucket", "list"]);
if (!/(?:^|\s)blogstack-media(?:\s|$)/m.test(buckets))
  command(["r2", "bucket", "create", "blogstack-media"]);
const queues = command(["queues", "list"]);
for (const name of ["blogstack-jobs", "blogstack-jobs-dead"]) {
  if (!queues.includes(name)) command(["queues", "create", name]);
}
const ids = {
  databaseId: database.uuid ?? database.id,
  cacheId: namespaces.find((n) => n.title === "blogstack-cache").id,
  cdnCacheId: namespaces.find((n) => n.title === "blogstack-cdn-cache").id,
  accountId: account,
};
for (const file of [
  "blogstack-api/wrangler.toml",
  "blogstack-cdn-worker/wrangler.toml",
]) {
  const text = readFileSync(file, "utf8")
    .replaceAll("REPLACE_WITH_D1_DATABASE_ID", ids.databaseId)
    .replaceAll("REPLACE_WITH_KV_CACHE_ID", ids.cacheId)
    .replaceAll("REPLACE_WITH_CDN_CACHE_KV_ID", ids.cdnCacheId)
    .replaceAll("REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID", account);
  writeFileSync(file, text);
}
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/cloudflare-resources.json",
  JSON.stringify(ids, null, 2) + "\n",
);
console.log(
  "Resource configuration written. Review config before remote migrations/deployment.",
);
