import { existsSync, readFileSync } from "node:fs";
import { PLANS } from "@blogstack/core";
const staticOnly = process.argv.includes("--static"),
  pilot = process.argv.includes("--pilot"),
  failures = [];
function requireCheck(ok, label) {
  console.log((ok ? "PASS " : "BLOCK ") + label);
  if (!ok) failures.push(label);
}
for (const path of [
  "blogstack-core/dist/index.js",
  "blogstack-sdk-js/dist/index.js",
  "blogstack-sdk-js/dist/react/index.d.ts",
  "blogstack-ui-react/dist/components/blog-post.js",
  "blogstack-editor/dist/index.js",
  "examples/nextjs/app/blog/[slug]/page.tsx",
  "docs/LAUNCH.md",
  "docs/RESTORE.md",
])
  requireCheck(existsSync(path), path);
requireCheck(
  PLANS.solo.monthly === 3 &&
    PLANS.studio.monthly === 9 &&
    PLANS.growth.monthly === 19 &&
    PLANS.growth.storageBytes === 100e9,
  "canonical prices and Growth 100 GB",
);
requireCheck(
  PLANS.studio.maxProjects === null && PLANS.growth.maxProjects === null,
  "Studio/Growth unlimited blogs",
);
if (!staticOnly) {
  const config =
    readFileSync("blogstack-api/wrangler.toml", "utf8") +
    readFileSync("blogstack-cdn-worker/wrangler.toml", "utf8");
  requireCheck(
    !config.includes("REPLACE_WITH"),
    "production Cloudflare resource IDs",
  );
  for (const key of [
    "POLAR_ACCESS_TOKEN",
    "POLAR_WEBHOOK_SECRET",
    "BETTER_AUTH_SECRET",
    "CDN_SECRET",
    "RESEND_API_KEY",
    "CF_ANALYTICS_TOKEN",
  ]) {
    requireCheck(
      Boolean(process.env[key]),
      key + " configured in the verification environment (value hidden)",
    );
  }
  const products = [];
  for (const plan of Object.keys(PLANS))
    for (const interval of ["MONTH", "YEAR"]) {
      const key = "POLAR_PRODUCT_" + plan.toUpperCase() + "_" + interval;
      requireCheck(Boolean(process.env[key]), key);
      products.push(process.env[key]);
    }
  requireCheck(
    products.every(Boolean) && new Set(products).size === 6,
    "six distinct Polar products",
  );
  for (const key of [
    "MERCHANT_VERIFIED",
    "EMAIL_VERIFIED",
    "PAYMENTS_VERIFIED",
    "AI_VERIFIED",
    "ANALYTICS_VERIFIED",
    "LINK_SCANNER_VERIFIED",
    "PUBLICATION_VERIFIED",
    "MEDIA_BACKUP_VERIFIED",
    "DOMAINS_VERIFIED",
    "POLAR_PORTAL_PLAN_CHANGES_DISABLED",
    "RESTORE_DRILL_PASSED",
    "ALERTS_VERIFIED",
    "PACKAGES_PUBLISHED",
    ...(pilot ? [] : ["PILOT_ACCEPTANCE_PASSED"]),
    "OPERATOR_DETAILS_VERIFIED",
    "CHECKOUT_ENABLED",
  ]) {
    requireCheck(process.env[key] === "true", key);
  }
  requireCheck(
    process.env.POLAR_SERVER === "production",
    "production Polar environment",
  );
}
if (failures.length) {
  console.error(
    failures.length +
      " launch gates remain. No deployment or charge was attempted.",
  );
  process.exitCode = 1;
}
