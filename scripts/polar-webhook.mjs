import { createPolar } from "@polar-sh/sdk/2026-10";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

const envIndex = process.argv.indexOf("--env-file");
const envPath = envIndex < 0 ? "launch.env" : process.argv[envIndex + 1];
const values = parseEnv(readFileSync(envPath, "utf8"));
const stage = process.argv.includes("--stage");
const environment = values.POLAR_SERVER || "sandbox";
if (!["sandbox", "production"].includes(environment))
  throw new Error("Invalid Polar environment");
if (
  stage &&
  (environment !== "production" || values.CHECKOUT_ENABLED !== "false")
)
  throw new Error(
    "Staging requires production configuration with checkout explicitly disabled",
  );
if (
  environment === "production" &&
  values.MERCHANT_VERIFIED !== "true" &&
  !stage
)
  throw new Error("Complete merchant verification before production setup");
const settings = JSON.parse(readFileSync(".launch/settings.json", "utf8"));
const url = settings.apiUrl + "/billing/webhooks/polar";
const events = [
  "customer.state_changed",
  "order.paid",
  "order.refunded",
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "subscription.cycled",
  "subscription.paused",
  "subscription.resumed",
];
const client = createPolar({
  accessToken: values.POLAR_ACCESS_TOKEN,
  environment,
  timeout: 20000,
});
let endpoint;
for await (const item of client.webhooks.iterListWebhookEndpoints())
  if (item.url === url) endpoint = item;
if (!endpoint)
  endpoint = await client.webhooks.createWebhookEndpoint({
    name: "BlogStack " + environment + " billing",
    url,
    format: "raw",
    api_version: "2026-10",
    events,
  });
if (
  endpoint.api_version !== "2026-10" ||
  endpoint.enabled !== !stage ||
  events.some((event) => !endpoint.events.includes(event))
)
  endpoint = await client.webhooks.updateWebhookEndpoint(endpoint.id, {
    api_version: "2026-10",
    enabled: !stage,
    events,
  });
const secrets = JSON.parse(readFileSync(".launch/secrets.json", "utf8"));
secrets.POLAR_ACCESS_TOKEN = values.POLAR_ACCESS_TOKEN;
secrets.POLAR_WEBHOOK_SECRET = endpoint.secret;
const secretsPath = stage
  ? ".launch/production.secrets.json"
  : ".launch/secrets.json";
writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + "\n", {
  mode: 0o600,
});
const products = JSON.parse(
  readFileSync("artifacts/polar-products." + environment + ".json", "utf8"),
);
const configPath = stage
  ? ".launch/production.app.wrangler.json"
  : ".launch/app.wrangler.json";
const config = JSON.parse(
  readFileSync(
    existsSync(configPath) ? configPath : ".launch/app.wrangler.json",
    "utf8",
  ),
);
config.vars = {
  ...config.vars,
  ...products,
  POLAR_SERVER: environment,
  CHECKOUT_ENABLED: "false",
};
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
  mode: 0o600,
});
let launch = readFileSync(envPath, "utf8");
for (const [key, value] of Object.entries({
  ...products,
  POLAR_WEBHOOK_SECRET: endpoint.secret,
  POLAR_SERVER: environment,
})) {
  const pattern = new RegExp("^" + key + "=.*$", "m");
  launch = pattern.test(launch)
    ? launch.replace(pattern, key + "=" + value)
    : launch + "\n" + key + "=" + value;
}
writeFileSync(envPath, launch, { mode: 0o600 });
writeFileSync(
  "artifacts/polar-webhook." + environment + ".json",
  JSON.stringify(
    {
      id: endpoint.id,
      url,
      environment,
      apiVersion: endpoint.api_version,
      events: endpoint.events,
      enabled: endpoint.enabled,
      staged: stage,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  (stage ? "Staged disabled " : "Configured signed ") +
    environment +
    " billing notifications at " +
    url +
    ". Secrets stored privately; checkout remains disabled.",
);
