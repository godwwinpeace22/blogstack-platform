import { createPolar } from "@polar-sh/sdk/2026-10";
import { PLANS } from "@blogstack/core";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const apply = process.argv.includes("--apply");
const prepareLive = process.argv.includes("--prepare-live");
const envIndex = process.argv.indexOf("--env-file");
const config =
  envIndex < 0
    ? process.env
    : parseEnv(readFileSync(process.argv[envIndex + 1], "utf8"));
const environment = config.POLAR_SERVER || "sandbox";
if (!["sandbox", "production"].includes(environment))
  throw new Error("POLAR_SERVER must be sandbox or production");
if (
  prepareLive &&
  (environment !== "production" || config.CHECKOUT_ENABLED !== "false")
)
  throw new Error(
    "Live catalog preparation requires production configuration with checkout explicitly disabled",
  );
const specifications = Object.entries(PLANS).flatMap(([plan, p]) =>
  ["month", "year"].map((interval) => ({
    plan,
    interval,
    name:
      "BlogStack " +
      p.name +
      " · " +
      (interval === "month" ? "monthly" : "annual"),
    amount: 100 * (interval === "month" ? p.monthly : p.annual),
    key: "POLAR_PRODUCT_" + plan.toUpperCase() + "_" + interval.toUpperCase(),
  })),
);
if (!apply) {
  console.log(
    JSON.stringify({ environment, products: specifications }, null, 2),
  );
  process.exit();
}
if (!config.POLAR_ACCESS_TOKEN)
  throw new Error("Set POLAR_ACCESS_TOKEN; it is never printed.");
if (
  environment === "production" &&
  config.MERCHANT_VERIFIED !== "true" &&
  !prepareLive
)
  throw new Error(
    "Complete merchant verification, or use --prepare-live to prepare products with checkout disabled.",
  );
const client = createPolar({
  accessToken: config.POLAR_ACCESS_TOKEN,
  environment,
  timeout: 20000,
});
const existing = [];
for await (const product of client.products.iterList({
  is_archived: false,
  limit: 100,
}))
  existing.push(product);
const ids = {};
for (const spec of specifications) {
  let product = existing.find(
    (p) =>
      p.metadata?.blogstack_plan === spec.plan &&
      p.metadata?.blogstack_interval === spec.interval &&
      p.metadata?.blogstack_catalog === "launch-v1",
  );
  if (!product)
    product = await client.products.create({
      name: spec.name,
      description:
        "Shared account subscription. See https://blogstack-site.hidden-silence-2d18.workers.dev/#pricing for allowances. No automatic overage charges.",
      recurring_interval: spec.interval,
      recurring_interval_count: 1,
      prices: [
        {
          amount_type: "fixed",
          price_currency: "usd",
          price_amount: spec.amount,
          tax_behavior: "exclusive",
        },
      ],
      metadata: {
        blogstack_plan: spec.plan,
        blogstack_interval: spec.interval,
        blogstack_catalog: "launch-v1",
      },
    });
  const price = product.prices.find((p) => p.amount_type === "fixed");
  if (
    product.recurring_interval !== spec.interval ||
    !price ||
    price.price_amount !== spec.amount ||
    price.price_currency !== "usd"
  )
    throw new Error(
      "Existing product differs from the canonical catalog: " + spec.key,
    );
  ids[spec.key] = product.id;
  console.log(spec.name + ": " + product.id);
}
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/polar-products." + environment + ".json",
  JSON.stringify(ids, null, 2) + "\n",
);
console.log(
  "Six prices verified. Configure these product IDs in API vars. Configure the signed webhook and disable portal plan changes before launch.",
);
