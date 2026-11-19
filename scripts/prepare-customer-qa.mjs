import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: { database: { type: "string" }, cache: { type: "string" } },
});
if (
  !/^[a-f0-9-]{36}$/.test(values.database || "") ||
  !/^[a-f0-9]{32}$/.test(values.cache || "")
)
  throw new Error("Supply isolated --database and --cache IDs");
const production = JSON.parse(
  readFileSync(".launch/app.wrangler.json", "utf8"),
);
if (
  production.d1_databases.some((d) => d.database_id === values.database) ||
  production.kv_namespaces.some((n) => n.id === values.cache)
)
  throw new Error("QA resources must be isolated");
const api = "https://blogstack-qa-app.hidden-silence-2d18.workers.dev";
const cdn = "https://blogstack-qa-cdn.hidden-silence-2d18.workers.dev";
const config = {
  ...production,
  name: "blogstack-qa-app",
  main: "../blogstack-api/test/qa-worker.ts",
  d1_databases: [
    {
      binding: "MAIN_DB",
      database_name: "blogstack-qa-db",
      database_id: values.database,
      migrations_dir: "../blogstack-api/migrations",
    },
  ],
  kv_namespaces: [
    { binding: "CACHE", id: values.cache },
    { binding: "CDN_CACHE", id: values.cache },
  ],
  r2_buckets: [{ binding: "MEDIA", bucket_name: "blogstack-qa-media" }],
  ratelimits: production.ratelimits.map((r, i) => ({
    ...r,
    namespace_id: String(1301 + i),
  })),
  vars: {
    API_URL: api,
    FRONTEND_URL: api,
    CDN_URL: cdn,
    CF_ACCOUNT_ID: production.account_id,
    SIGNUP_MODE: "closed",
    PILOT_EMAILS: "",
    CHECKOUT_ENABLED: "false",
    EMAIL_FROM: "BlogStack QA <qa@example.invalid>",
  },
};
delete config.queues;
delete config.triggers;
config.services = (config.services || []).filter(
  (s) => s.binding === "LINK_SCANNER",
);
writeFileSync(
  ".launch/customer-qa.app.wrangler.json",
  JSON.stringify(config, null, 2) + "\n",
  { mode: 0o600 },
);
const media = JSON.parse(readFileSync(".launch/cdn.wrangler.json", "utf8"));
Object.assign(media, {
  name: "blogstack-qa-cdn",
  d1_databases: config.d1_databases,
  kv_namespaces: [{ binding: "CDN_CACHE", id: values.cache }],
  r2_buckets: [{ binding: "R2", bucket_name: "blogstack-qa-media" }],
  vars: { API_BASE_URL: api },
});
writeFileSync(
  ".launch/customer-qa.cdn.wrangler.json",
  JSON.stringify(media, null, 2) + "\n",
  { mode: 0o600 },
);
if (!existsSync(".launch/customer-qa-fixture.json")) {
  const fixture = {
    url: api,
    cdn,
    databaseId: values.database,
    password: randomBytes(30).toString("base64url"),
    controlSecret: randomBytes(36).toString("base64url"),
    users: ["agency", "client", "outsider", "solo", "growth"].map((role) => ({
      role,
      id: randomUUID(),
      email: "blogstack-qa-" + role + "@example.invalid",
      credentialId: randomUUID(),
    })),
  };
  const password = await hashPassword(fixture.password);
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const sql = fixture.users.flatMap((user) => [
    "INSERT INTO users(id,name,email,email_verified,created_at,updated_at) VALUES(" +
      [user.id, "QA " + user.role, user.email, 1].map(quote).join(",") +
      ",unixepoch(),unixepoch());",
    "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(" +
      [user.credentialId, user.id, "credential", user.id, password]
        .map(quote)
        .join(",") +
      ",unixepoch(),unixepoch());",
  ]);
  writeFileSync(".launch/customer-qa-seed.sql", sql.join("\n") + "\n", {
    mode: 0o600,
  });
  writeFileSync(
    ".launch/customer-qa-fixture.json",
    JSON.stringify(fixture, null, 2) + "\n",
    { mode: 0o600 },
  );
  const existing = JSON.parse(readFileSync(".launch/secrets.json", "utf8"));
  const cdnSecret = randomBytes(36).toString("base64url");
  writeFileSync(
    ".launch/customer-qa.secrets.json",
    JSON.stringify({
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
      CDN_SECRET: cdnSecret,
      QA_CONTROL_SECRET: fixture.controlSecret,
      CF_ANALYTICS_TOKEN: existing.CF_ANALYTICS_TOKEN,
    }) + "\n",
    { mode: 0o600 },
  );
  writeFileSync(
    ".launch/customer-qa.cdn.secrets.json",
    JSON.stringify({ CDN_SECRET: cdnSecret }) + "\n",
    { mode: 0o600 },
  );
}
const saved = JSON.parse(
  readFileSync(".launch/customer-qa-fixture.json", "utf8"),
);
if (saved.databaseId !== values.database || saved.url !== api)
  throw new Error("Existing QA fixture belongs to a different environment");
console.log(
  "Prepared isolated QA: five synthetic users, separate D1/R2/cache, closed signup, no payment/email credentials, no queues or cron. Background jobs require explicit authenticated QA dispatch.",
);
