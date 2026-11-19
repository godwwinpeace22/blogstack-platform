import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    directory: { type: "string" },
    project: { type: "string" },
    api: { type: "string" },
    site: { type: "string" },
    worker: { type: "string" },
    account: { type: "string" },
  },
});
for (const key of ["directory", "project", "api", "site", "worker", "account"])
  if (!values[key]) throw new Error("Required option: --" + key);
for (const key of ["api", "site"]) {
  const url = new URL(values[key]);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "--" + key + " must be a public HTTPS origin without credentials",
    );
  values[key] = url.origin;
}
if (
  !/^[a-z0-9][a-z0-9-]*$/.test(values.worker) ||
  !/^[a-f0-9]{32}$/.test(values.account)
)
  throw new Error("Invalid worker name or Cloudflare account ID");
const target = resolve(values.directory);
if (existsSync(target))
  throw new Error(
    "Choose a new empty directory; existing installations are never overwritten",
  );
mkdirSync(target, { recursive: true });
cpSync("examples/nextjs", target, {
  recursive: true,
  filter: (source) =>
    !source.includes("/node_modules") &&
    !source.includes("/.next") &&
    !source.endsWith(".tsbuildinfo") &&
    !/\/\.env(?:\.|$)/.test(source),
});
const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
manifest.name = values.worker;
manifest.dependencies["@blogstack/sdk"] = "0.2.0";
manifest.dependencies["@blogstack/ui"] = "0.2.0";
manifest.dependencies.next = "15.5.29";
Object.assign(manifest.devDependencies, {
  "@opennextjs/cloudflare": "1.20.17",
  wrangler: "4.165.0",
});
Object.assign(manifest.scripts, {
  "build:cloudflare": "opennextjs-cloudflare build",
  "deploy:cloudflare": "opennextjs-cloudflare deploy",
});
writeFileSync(
  join(target, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  join(target, "open-next.config.ts"),
  'import { defineCloudflareConfig } from "@opennextjs/cloudflare";\nexport default defineCloudflareConfig();\n',
);
mkdirSync(join(target, "public"), { recursive: true });
writeFileSync(
  join(target, "public/_headers"),
  "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n",
);
const vars = {
  BLOGSTACK_PROJECT_SLUG: values.project,
  BLOGSTACK_API_URL: values.api,
  SITE_URL: values.site,
};
writeFileSync(
  join(target, ".env.local"),
  Object.entries(vars)
    .map(([key, value]) => key + "=" + value)
    .join("\n") + "\n",
  { mode: 0o600 },
);
writeFileSync(
  join(target, "wrangler.jsonc"),
  JSON.stringify(
    {
      name: values.worker,
      account_id: values.account,
      main: ".open-next/worker.js",
      compatibility_date: "2026-11-19",
      compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
      assets: { directory: ".open-next/assets", binding: "ASSETS" },
      services: [{ binding: "WORKER_SELF_REFERENCE", service: values.worker }],
      workers_dev: true,
      preview_urls: false,
      observability: { enabled: true },
      vars,
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared a standalone public-npm installation at " + target);
console.log(
  "From that directory: npm install, npm run build:cloudflare, npm run deploy:cloudflare. Set the same blog URL in project settings. No private API key is needed.",
);
