#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import {
  validateInstall,
  installUrls,
  workerConfigs,
  secretsFor,
  selfHostedSql,
} from "./lib/self-hosting.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const dir = join(root, ".self-hosted"),
  file = (name) => join(dir, name);
const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    "account-id": { type: "string" },
    "workers-subdomain": { type: "string" },
    "operator-email": { type: "string" },
    "email-from": { type: "string" },
    "with-operations": { type: "boolean" },
    "without-ai": { type: "boolean" },
    "without-analytics": { type: "boolean" },
    local: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
});
const command = positionals[0] || "help";
const local = !!flags.local;
const json = (name) => JSON.parse(readFileSync(file(name), "utf8"));
function save(name, value) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file(name), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(file(name), 0o600);
}
function load() {
  if (!existsSync(file("install.json")))
    throw new Error("Run npm run self-host:init first");
  return validateInstall(json("install.json"));
}
function environment(config) {
  // Do not read the managed service's launch.env, private launcher or secrets.
  return {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: config.accountId,
    WRANGLER_SEND_METRICS: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
function run(
  program,
  args,
  config,
  { input, capture = false, extraEnv = {} } = {},
) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: { ...environment(config), ...extraEnv },
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: capture
      ? ["pipe", "pipe", "pipe"]
      : [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
  });
  if (result.error || result.status !== 0)
    throw new Error(
      "Command failed: " +
        program +
        " " +
        args.filter((a) => !a.startsWith('{"')).join(" ") +
        (capture
          ? ". Inspect the command locally; credential output was withheld."
          : ""),
    );
  return result.stdout;
}
const wrangler = (args, config, options) =>
  run(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    config,
    options,
  );
const cfg = (service) => file(service + ".wrangler.json");
function localResources(c) {
  return {
    d1_databases: [
      {
        binding: "MAIN_DB",
        database_name: c.name + "-db",
        database_id: "00000000-0000-0000-0000-000000000001",
      },
    ],
    kv_namespaces: [
      { binding: "CACHE", id: "00000000000000000000000000000001" },
      { binding: "CDN_CACHE", id: "00000000000000000000000000000002" },
    ],
  };
}
function render(c) {
  const resources = local ? localResources(c) : json("provision.wrangler.json");
  const configs = workerConfigs(c, resources, { local });
  for (const [name, config] of Object.entries(configs))
    save(name + ".wrangler.json", config);
  writeFileSync(file("self-hosted.sql"), selfHostedSql(c), { mode: 0o600 });
  return configs;
}
function init() {
  if (existsSync(file("install.json")))
    throw new Error(
      "An installation already exists. Edit .self-hosted/install.json, then render or deploy; init never overwrites credentials.",
    );
  const c = validateInstall({
    name: flags.name || (local ? "blogstack-local" : undefined),
    accountId: flags["account-id"] || (local ? "0".repeat(32) : undefined),
    workersSubdomain:
      flags["workers-subdomain"] || (local ? "local" : undefined),
    operatorEmail:
      flags["operator-email"] || (local ? "owner@example.com" : undefined),
    emailFrom:
      flags["email-from"] ||
      (local ? "BlogStack <noreply@example.com>" : undefined),
    features: {
      operations: !!flags["with-operations"],
      ai: !flags["without-ai"],
      analytics: !flags["without-analytics"],
    },
  });
  save("install.json", c);
  save("secrets.json", {
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    CDN_SECRET: randomBytes(32).toString("hex"),
    RESEND_API_KEY: "",
    CF_ANALYTICS_TOKEN: "",
    CF_BACKUP_TOKEN: "",
  });
  if (local) render(c);
  console.log(
    "Prepared operator-owned configuration in .self-hosted/ (ignored by Git). Generated secrets were saved privately and were not printed.",
  );
  console.log(
    local
      ? "Next: npm run self-host:dev"
      : "Next: add your provider credentials to .self-hosted/secrets.json, then run self-host:provision and self-host:deploy.",
  );
}
function provision(c) {
  if (local || c.accountId === "0".repeat(32))
    throw new Error(
      "Provision requires a real account; local development creates no cloud resources",
    );
  if (!existsSync(file("provision.wrangler.json")))
    save("provision.wrangler.json", {
      name: c.name + "-provision",
      account_id: c.accountId,
      compatibility_date: "2026-09-14",
    });
  const get = () => json("provision.wrangler.json");
  if (get().account_id !== c.accountId)
    throw new Error(
      "The provisioned account differs from install.json; use a separate clone for a different installation",
    );
  function create(kind, binding, name) {
    const group = { d1: "d1_databases", kv: "kv_namespaces", r2: "r2_buckets" }[
      kind
    ];
    if (get()[group]?.some((r) => r.binding === binding)) return;
    const args =
      kind === "d1"
        ? ["d1", "create", name]
        : kind === "kv"
          ? ["kv", "namespace", "create", name]
          : ["r2", "bucket", "create", name];
    wrangler(
      [
        ...args,
        "--config",
        file("provision.wrangler.json"),
        "--binding",
        binding,
        "--update-config",
        "true",
      ],
      c,
    );
    if (!get()[group]?.some((r) => r.binding === binding))
      throw new Error(
        "Wrangler did not record " +
          binding +
          "; inspect provision.wrangler.json before retrying",
      );
  }
  create("d1", "MAIN_DB", c.name + "-db");
  create("kv", "CACHE", c.name + "-cache");
  create("kv", "CDN_CACHE", c.name + "-cdn-cache");
  create("r2", "MEDIA", c.name + "-media");
  if (c.features.operations) {
    create("d1", "STATE", c.name + "-ops-db");
    create("r2", "BACKUPS", c.name + "-backups");
    const done = existsSync(file("queues.json")) ? json("queues.json") : [];
    for (const name of [
      c.name + "-jobs",
      c.name + "-jobs-dead",
      c.name + "-ops-jobs",
      c.name + "-ops-jobs-dead",
    ]) {
      if (done.includes(name)) continue;
      wrangler(
        ["queues", "create", name, "--config", file("provision.wrangler.json")],
        c,
      );
      done.push(name);
      save("queues.json", done);
    }
  }
  render(c);
  console.log(
    "Provisioned resources are recorded locally. This command never changes the Cloudflare plan or creates Polar products.",
  );
}
function migrate(c) {
  const mode = local
    ? ["--local", "--persist-to", file("state")]
    : ["--remote"];
  wrangler(
    ["d1", "migrations", "apply", "MAIN_DB", "--config", cfg("app"), ...mode],
    c,
    { input: "y\n" },
  );
  wrangler(
    [
      "d1",
      "execute",
      "MAIN_DB",
      "--config",
      cfg("app"),
      ...mode,
      "--file",
      file("self-hosted.sql"),
    ],
    c,
    { input: "y\n" },
  );
  const output = wrangler(
    [
      "d1",
      "execute",
      "MAIN_DB",
      "--config",
      cfg("app"),
      ...mode,
      "--command",
      "SELECT mode FROM deployment_settings WHERE id=1",
      "--json",
    ],
    c,
    { capture: true },
  );
  const result = JSON.parse(output);
  if (result[0]?.results?.[0]?.mode !== "self_hosted")
    throw new Error(
      "Refusing to convert a managed database with existing accounts. No workers were deployed.",
    );
  if (c.features.operations && !local)
    wrangler(
      [
        "d1",
        "migrations",
        "apply",
        "STATE",
        "--config",
        cfg("ops"),
        "--remote",
      ],
      c,
      { input: "y\n" },
    );
}
function build(c) {
  run("npm", ["run", "build:packages"], c);
  run("npm", ["run", "build", "-w", "@blogstack/dashboard"], c, {
    extraEnv: { VITE_API_URL: installUrls(c, local).app },
  });
}
function deploy(c) {
  const configs = render(c);
  const secrets = json("secrets.json");
  if (!flags["dry-run"]) {
    if (local || c.accountId === "0".repeat(32))
      throw new Error("Use self-host:dev for local development");
    const required = [
      "BETTER_AUTH_SECRET",
      "CDN_SECRET",
      "RESEND_API_KEY",
      ...(c.features.analytics ? ["CF_ANALYTICS_TOKEN"] : []),
      ...(c.features.operations
        ? ["CF_BACKUP_TOKEN", "CF_ANALYTICS_TOKEN"]
        : []),
    ];
    for (const key of required)
      if (!secrets[key])
        throw new Error(
          "Set " +
            key +
            " in .self-hosted/secrets.json; never put it in install.json or chat",
        );
    for (const key of ["BETTER_AUTH_SECRET", "CDN_SECRET"])
      if (secrets[key].length < 32)
        throw new Error(key + " must contain at least 32 characters");
  }
  build(c);
  if (!flags["dry-run"]) migrate(c);
  // Public egress and private operations exist before the API service bindings.
  for (const service of [
    "links",
    "cdn",
    ...(configs.ops ? ["ops"] : []),
    "app",
  ]) {
    if (!flags["dry-run"]) {
      const values = secretsFor(service, secrets);
      if (Object.keys(values).length)
        wrangler(["secret", "bulk", "--config", cfg(service)], c, {
          input: JSON.stringify(values),
        });
    }
    wrangler(
      [
        "deploy",
        "--config",
        cfg(service),
        ...(flags["dry-run"]
          ? ["--dry-run", "--outdir", file("build/" + service)]
          : []),
      ],
      c,
    );
  }
  console.log(
    flags["dry-run"]
      ? "All installation workers bundled without deploying."
      : "Deployed. Next: npm run self-host:check, then register the operator account and verify its email.",
  );
}
function dev(c) {
  if (!local) throw new Error("Local development requires --local");
  render(c);
  build(c);
  migrate(c);
  // Local mail links go only to this process's console, never to a cloud API.
  const s = json("secrets.json");
  writeFileSync(
    file(".dev.vars"),
    "BETTER_AUTH_SECRET=" +
      s.BETTER_AUTH_SECRET +
      "\nCDN_SECRET=" +
      s.CDN_SECRET +
      "\n",
    { mode: 0o600 },
  );
  const children = [
    ["links", c.localPorts.links],
    ["cdn", c.localPorts.media],
    ["app", c.localPorts.app],
  ].map(([service, port]) =>
    spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--config",
        cfg(service),
        "--port",
        String(port),
        "--inspector-port",
        "0",
        "--persist-to",
        file("state"),
      ],
      { cwd: root, env: environment(c), stdio: "inherit" },
    ),
  );
  const stop = (signal) => children.forEach((child) => child.kill(signal));
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  for (const child of children)
    child.on("exit", (code) => {
      if (code && code !== 130) {
        stop("SIGTERM");
        process.exitCode = code;
      }
    });
}
async function check(c) {
  const urls = installUrls(c, local);
  const health = await fetch(urls.app + "/health", {
    signal: AbortSignal.timeout(15000),
  });
  if (!health.ok || !(await health.json()).ok)
    throw new Error("API health check failed");
  const page = await fetch(urls.app + "/login", {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!page.ok || !(await page.text()).includes('id="root"'))
    throw new Error("Dashboard installation check failed");
  const media = await fetch(urls.media + "/missing-installation-probe", {
    signal: AbortSignal.timeout(15000),
  });
  if (media.status !== 404) throw new Error("Media worker check failed");
  console.log(
    "PASS: API, dashboard and media delivery are reachable at your installation. Complete the publication/restore acceptance in docs/SELF_HOSTING.md before serving customers.",
  );
  console.log("Dashboard: " + urls.app);
}
try {
  if (command === "init") init();
  else if (command === "help")
    console.log(
      "Usage: npm run self-host -- init|provision|render|migrate|deploy|dev|check [--local] [--dry-run]. See docs/SELF_HOSTING.md.",
    );
  else {
    const c = load();
    if (command === "provision") provision(c);
    else if (command === "render") render(c);
    else if (command === "migrate") {
      render(c);
      migrate(c);
    } else if (command === "deploy") deploy(c);
    else if (command === "dev") dev(c);
    else if (command === "check") await check(c);
    else throw new Error("Unknown self-host command");
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Self-hosting command failed",
  );
  process.exitCode = 1;
}
