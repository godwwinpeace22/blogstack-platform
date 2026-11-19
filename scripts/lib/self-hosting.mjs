import { createHash } from "node:crypto";

export const DEFAULT_LIMITS = Object.freeze({
  maxBlogs: null,
  maxPeople: 100,
  storageBytes: 100_000_000_000,
  aiCredits: 500,
  linkChecks: 25_000,
  analyticsDays: 365,
  maxPosts: 10_000,
  auditDays: 1,
});
const bounds = {
  maxPeople: [1, 1_000_000],
  storageBytes: [1, 1_000_000_000_000_000],
  aiCredits: [0, 1_000_000_000],
  linkChecks: [0, 1_000_000_000],
  analyticsDays: [1, 3650],
  maxPosts: [1, 1_000_000],
  auditDays: [1, 365],
};
export function validateInstall(input) {
  if (!input || typeof input !== "object")
    throw new Error("Installation configuration is required");
  const { name, accountId, workersSubdomain, operatorEmail, emailFrom } = input;
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(name || ""))
    throw new Error(
      "Use a 3–40 character installation name containing lowercase letters, numbers and hyphens",
    );
  if (!/^[a-f0-9]{32}$/.test(accountId || ""))
    throw new Error("A Cloudflare account ID is required");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workersSubdomain || ""))
    throw new Error(
      "Use your account's workers.dev subdomain, without .workers.dev",
    );
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(operatorEmail || ""))
    throw new Error("A valid operator email is required");
  if (
    typeof emailFrom !== "string" ||
    emailFrom.length > 320 ||
    /[\r\n]/.test(emailFrom) ||
    !emailFrom.includes("@")
  )
    throw new Error(
      "Set a verified email sender, for example BlogStack <noreply@yourdomain.com>",
    );
  const features = {
    ai: true,
    analytics: true,
    operations: false,
    ...input.features,
  };
  for (const value of Object.values(features))
    if (typeof value !== "boolean")
      throw new Error("Feature switches must be booleans");
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  if (
    limits.maxBlogs !== null &&
    (!Number.isSafeInteger(limits.maxBlogs) || limits.maxBlogs < 1)
  )
    throw new Error("maxBlogs must be null or a positive integer");
  for (const [key, [min, max]] of Object.entries(bounds))
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < min ||
      limits[key] > max
    )
      throw new Error("Invalid self-hosted resource budget: " + key);
  const localPorts = {
    app: 8787,
    media: 8788,
    links: 8790,
    ...input.localPorts,
  };
  if (
    Object.values(localPorts).some(
      (port) => !Number.isInteger(port) || port < 1024 || port > 65535,
    ) ||
    new Set(Object.values(localPorts)).size !== 3
  )
    throw new Error(
      "Local ports must be three distinct port numbers between 1024 and 65535",
    );
  const domains = { ...input.domains };
  for (const key of Object.keys(domains)) {
    if (
      !["app", "media"].includes(key) ||
      typeof domains[key] !== "string" ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        domains[key],
      )
    )
      throw new Error(
        "Custom domains must be plain app/media hostnames in your Cloudflare account",
      );
  }
  return {
    version: 1,
    name,
    accountId,
    workersSubdomain,
    operatorEmail: operatorEmail.toLowerCase(),
    emailFrom,
    features,
    limits,
    localPorts,
    domains,
  };
}
export function installUrls(config, local = false) {
  return local
    ? {
        app: "http://localhost:" + config.localPorts.app,
        media: "http://localhost:" + config.localPorts.media,
      }
    : {
        app:
          "https://" +
          (config.domains.app ||
            `${config.name}-app.${config.workersSubdomain}.workers.dev`),
        media:
          "https://" +
          (config.domains.media ||
            `${config.name}-cdn.${config.workersSubdomain}.workers.dev`),
      };
}
export function selfHostedSql(config) {
  const c = validateInstall(config),
    l = c.limits;
  // Existing hosted installations with accounts cannot be converted by accident.
  // Re-running this on a self-hosted installation only changes operator budgets.
  return `UPDATE deployment_settings SET mode='self_hosted',max_blogs=${l.maxBlogs ?? "NULL"},max_people=${l.maxPeople},storage_bytes=${l.storageBytes},ai_credits=${l.aiCredits},link_checks=${l.linkChecks},analytics_days=${l.analyticsDays},max_posts=${l.maxPosts},audit_days=${l.auditDays} WHERE id=1 AND (mode='self_hosted' OR NOT EXISTS(SELECT 1 FROM accounts));\n`;
}
export function workerConfigs(config, resources, { local = false } = {}) {
  const c = validateInstall(config),
    { app, media } = installUrls(c, local);
  const db = resources.d1_databases?.find((r) => r.binding === "MAIN_DB");
  const state = resources.d1_databases?.find((r) => r.binding === "STATE");
  const kv = (binding) =>
    resources.kv_namespaces?.find((r) => r.binding === binding);
  if (!db?.database_id || !kv("CACHE")?.id || !kv("CDN_CACHE")?.id)
    throw new Error(
      "Provision MAIN_DB, CACHE and CDN_CACHE before rendering Worker configuration",
    );
  const base = {
    account_id: c.accountId,
    compatibility_date: "2026-09-14",
    preview_urls: false,
    observability: { enabled: true, head_sampling_rate: 0.1 },
  };
  const mainDb = { ...db, migrations_dir: "../blogstack-api/migrations" };
  const rateId =
    parseInt(
      createHash("sha256").update(c.name).digest("hex").slice(0, 7),
      16,
    ) + 100;
  const dataset = "bs_" + c.name.replaceAll("-", "_") + "_events";
  const configs = {
    app: {
      ...base,
      name: c.name + "-app",
      main: "../blogstack-api/src/index.ts",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      assets: {
        directory: "../blogstack-dashboard/dist",
        binding: "DASHBOARD_ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: true,
      },
      d1_databases: [mainDb],
      kv_namespaces: [kv("CACHE"), kv("CDN_CACHE")],
      r2_buckets: [{ binding: "MEDIA", bucket_name: c.name + "-media" }],
      services: [{ binding: "LINK_SCANNER", service: c.name + "-links" }],
      triggers: { crons: ["* * * * *"] },
      ratelimits: [
        {
          name: "AUTH_RATE_LIMIT",
          namespace_id: String(rateId),
          simple: { limit: 20, period: 60 },
        },
        {
          name: "EVENT_RATE_LIMIT",
          namespace_id: String(rateId + 1),
          simple: { limit: 100, period: 60 },
        },
      ],
      vars: {
        DEPLOYMENT_MODE: "self_hosted",
        LIFECYCLE_ON_MINUTE_CRON: "true",
        API_URL: app,
        FRONTEND_URL: app,
        CDN_URL: media,
        EMAIL_FROM: c.emailFrom,
        OPERATOR_EMAIL: c.operatorEmail,
        SIGNUP_MODE: "pilot",
        PILOT_EMAILS: c.operatorEmail,
        CHECKOUT_ENABLED: "false",
        CF_ACCOUNT_ID: c.accountId,
        ANALYTICS_DATASET: dataset,
      },
    },
    cdn: {
      ...base,
      name: c.name + "-cdn",
      main: "../blogstack-cdn-worker/src/index.ts",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      d1_databases: [mainDb],
      kv_namespaces: [kv("CDN_CACHE")],
      r2_buckets: [{ binding: "R2", bucket_name: c.name + "-media" }],
      vars: { API_BASE_URL: app },
    },
    links: {
      ...base,
      name: c.name + "-links",
      main: "../blogstack-link-worker/src/index.ts",
      compatibility_flags: ["global_fetch_strictly_public"],
      workers_dev: false,
    },
  };
  for (const [service, key] of [
    ["app", "app"],
    ["cdn", "media"],
  ])
    if (!local && c.domains[key])
      configs[service].routes = [
        { pattern: c.domains[key], custom_domain: true },
      ];
  if (c.features.ai && !local) configs.app.ai = { binding: "AI" };
  if (c.features.analytics && !local)
    configs.app.analytics_engine_datasets = [{ binding: "ANALYTICS", dataset }];
  if (c.features.operations && !local) {
    if (!state?.database_id)
      throw new Error("Provision the operations STATE database first");
    const queue = c.name + "-jobs",
      dead = queue + "-dead",
      ops = c.name + "-ops-jobs",
      opsDead = ops + "-dead";
    configs.app.queues = {
      producers: [{ binding: "JOB_QUEUE", queue }],
      consumers: [
        {
          queue,
          max_batch_size: 1,
          max_batch_timeout: 5,
          max_retries: 3,
          dead_letter_queue: dead,
        },
      ],
    };
    configs.app.services.push({
      binding: "OPERATIONS",
      service: c.name + "-ops",
    });
    configs.app.vars.MEDIA_DELETE_GRACE_SECONDS = "172800";
    configs.ops = {
      ...base,
      name: c.name + "-ops",
      main: "../blogstack-ops-worker/src/index.ts",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      d1_databases: [
        { ...state, migrations_dir: "../blogstack-ops-worker/migrations" },
        { ...mainDb, binding: "SOURCE_DB" },
      ],
      r2_buckets: [
        { binding: "SOURCE_MEDIA", bucket_name: c.name + "-media" },
        { binding: "BACKUPS", bucket_name: c.name + "-backups" },
      ],
      queues: {
        producers: [
          { binding: "JOBS", queue: ops },
          { binding: "MAIN_QUEUE", queue },
          { binding: "MAIN_DEAD", queue: dead },
          { binding: "OPS_DEAD", queue: opsDead },
        ],
        consumers: [
          {
            queue: ops,
            max_batch_size: 1,
            max_batch_timeout: 1,
            max_retries: 5,
            dead_letter_queue: opsDead,
          },
        ],
      },
      triggers: { crons: ["*/5 * * * *"] },
      vars: {
        OPS_ENABLED: "true",
        CF_ACCOUNT_ID: c.accountId,
        SOURCE_DATABASE_ID: db.database_id,
        SOURCE_BUCKET_NAME: c.name + "-media",
        EMAIL_FROM: c.emailFrom,
        ALERT_EMAIL: c.operatorEmail,
        WORKER_NAMES: JSON.stringify([
          c.name + "-app",
          c.name + "-cdn",
          c.name + "-links",
          c.name + "-ops",
        ]),
        HEALTH_URLS: JSON.stringify([
          { name: "Publishing API", url: app + "/health", contains: "ok" },
        ]),
      },
    };
  }
  return configs;
}
export function secretsFor(service, secrets) {
  const keys =
    service === "app"
      ? [
          "BETTER_AUTH_SECRET",
          "CDN_SECRET",
          "RESEND_API_KEY",
          "CF_ANALYTICS_TOKEN",
        ]
      : service === "cdn"
        ? ["CDN_SECRET"]
        : service === "ops"
          ? ["CF_BACKUP_TOKEN", "CF_ANALYTICS_TOKEN", "RESEND_API_KEY"]
          : [];
  return Object.fromEntries(
    keys.filter((k) => secrets[k]).map((k) => [k, secrets[k]]),
  );
}
