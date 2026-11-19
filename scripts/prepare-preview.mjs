import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
const resources = JSON.parse(
  readFileSync("artifacts/cloudflare-resources.json", "utf8"),
);
const account = resources.accountId;
const subdomain = process.env.WORKERS_SUBDOMAIN;
if (
  !/^[a-f0-9]{32}$/.test(account) ||
  !subdomain ||
  !/^[a-z0-9-]+\.workers\.dev$/.test(subdomain)
)
  throw new Error(
    "Set WORKERS_SUBDOMAIN to the account's actual workers.dev hostname.",
  );
const apiUrl = "https://blogstack-app." + subdomain,
  cdnUrl = "https://blogstack-cdn." + subdomain;
mkdirSync(".launch", { recursive: true, mode: 0o700 });
chmodSync(".launch", 0o700);
const shared = {
  account_id: account,
  compatibility_date: "2026-09-14",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: false,
  observability: { enabled: true, head_sampling_rate: 0.1 },
};
const db = {
  binding: "MAIN_DB",
  database_name: "blogstack-db",
  database_id: resources.databaseId,
  migrations_dir: "../blogstack-api/migrations",
};
const app = {
  ...shared,
  name: "blogstack-app",
  main: "../blogstack-api/src/index.ts",
  assets: {
    directory: "../blogstack-dashboard/dist",
    binding: "DASHBOARD_ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: true,
  },
  d1_databases: [db],
  kv_namespaces: [
    { binding: "CACHE", id: resources.cacheId },
    { binding: "CDN_CACHE", id: resources.cdnCacheId },
  ],
  r2_buckets: [{ binding: "MEDIA", bucket_name: "blogstack-media" }],
  queues: {
    producers: [{ binding: "JOB_QUEUE", queue: "blogstack-jobs" }],
    consumers: [
      {
        queue: "blogstack-jobs",
        max_batch_size: 1,
        max_batch_timeout: 5,
        max_retries: 3,
        dead_letter_queue: "blogstack-jobs-dead",
      },
    ],
  },
  services: [{ binding: "LINK_SCANNER", service: "blogstack-link-scanner" }],
  ai: { binding: "AI" },
  analytics_engine_datasets: [
    { binding: "ANALYTICS", dataset: "blogstack_events" },
  ],
  ratelimits: [
    {
      name: "EVENT_RATE_LIMIT",
      namespace_id: "1001",
      simple: { limit: 100, period: 60 },
    },
    {
      name: "AUTH_RATE_LIMIT",
      namespace_id: "1002",
      simple: { limit: 20, period: 60 },
    },
  ],
  triggers: { crons: ["* * * * *", "0 * * * *"] },
  vars: {
    API_URL: apiUrl,
    FRONTEND_URL: apiUrl,
    CDN_URL: cdnUrl,
    CF_ACCOUNT_ID: account,
    EMAIL_FROM: "",
    SIGNUP_MODE: "closed",
    PILOT_EMAILS: "",
    CHECKOUT_ENABLED: "false",
    POLAR_SERVER: "sandbox",
  },
};
const cdn = {
  ...shared,
  name: "blogstack-cdn",
  main: "../blogstack-cdn-worker/src/index.ts",
  d1_databases: [db],
  r2_buckets: [{ binding: "R2", bucket_name: "blogstack-media" }],
  kv_namespaces: [{ binding: "CDN_CACHE", id: resources.cdnCacheId }],
  vars: { API_BASE_URL: apiUrl },
};
// Resource refreshes must preserve reviewed gates, catalog IDs and sender settings.
for (const [name, config] of [["app", app], ["cdn", cdn]]) {
  const path = ".launch/" + name + ".wrangler.json";
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, "utf8"));
    config.vars = { ...previous.vars, ...config.vars };
    if (name === "app") {
      for (const [key, value] of Object.entries(previous.vars ?? {}))
        if (!["API_URL", "FRONTEND_URL", "CDN_URL", "CF_ACCOUNT_ID"].includes(key))
          config.vars[key] = value;
    }
  }
}
for (const [name, config] of [
  ["app", app],
  ["cdn", cdn],
])
  writeFileSync(
    ".launch/" + name + ".wrangler.json",
    JSON.stringify(config, null, 2) + "\n",
    { mode: 0o600 },
  );
writeFileSync(
  ".launch/settings.json",
  JSON.stringify(
    { accountId: account, cloudflareAuth: "oauth", apiUrl, cdnUrl, subdomain },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
if (!existsSync(".launch/secrets.json"))
  writeFileSync(
    ".launch/secrets.json",
    JSON.stringify(
      {
        BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
        CDN_SECRET: randomBytes(48).toString("base64url"),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
const secrets = JSON.parse(readFileSync(".launch/secrets.json", "utf8"));
writeFileSync(
  ".launch/cdn-secrets.json",
  JSON.stringify({ CDN_SECRET: secrets.CDN_SECRET }, null, 2) + "\n",
  { mode: 0o600 },
);
if (!existsSync("launch.env")) {
  let text = readFileSync("launch.env.example", "utf8")
    .replace(/^CLOUDFLARE_ACCOUNT_ID=.*$/m, "CLOUDFLARE_ACCOUNT_ID=" + account)
    .replace(/^SIGNUP_MODE=.*$/m, "SIGNUP_MODE=closed")
    .replace(/^POLAR_SERVER=.*$/m, "POLAR_SERVER=sandbox");
  text +=
    "\nCF_ACCOUNT_ID=" +
    account +
    "\nAPI_URL=" +
    apiUrl +
    "\nFRONTEND_URL=" +
    apiUrl +
    "\nCDN_URL=" +
    cdnUrl +
    "\n";
  writeFileSync("launch.env", text, { mode: 0o600 });
}
console.log(
  JSON.stringify(
    {
      apiUrl,
      cdnUrl,
      signup: app.vars.SIGNUP_MODE,
      checkout: app.vars.CHECKOUT_ENABLED,
      configs: [".launch/app.wrangler.json", ".launch/cdn.wrangler.json"],
    },
    null,
    2,
  ),
);
