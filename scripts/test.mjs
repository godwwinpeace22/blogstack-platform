import { spawnSync } from "node:child_process";
const bun = process.env.BUN_BIN || "bun";
for (const [command, args] of [
  [
    bun,
    [
      "test",
      "blogstack-api/test",
      "blogstack-cdn-worker/test",
      "blogstack-link-worker/test",
      "blogstack-ops-worker/test",
      "blogstack-core/test",
    ],
  ],
  ["npm", ["test", "-w", "@blogstack/sdk"]],
  ["npm", ["test", "-w", "@blogstack/ui"]],
  ["npm", ["test", "-w", "@blogstack/editor"]],
  ["npm", ["test", "-w", "@blogstack/registry"]],
]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
