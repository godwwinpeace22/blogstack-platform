import { defineConfig } from "tsup";
const common = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  sourcemap: true,
  treeshake: true,
};
export default defineConfig([
  { ...common, entry: { index: "src/index.ts" }, clean: true },
  {
    ...common,
    entry: { "react/index": "src/react/index.ts" },
    banner: { js: '"use client";' },
    external: ["react", "@tanstack/react-query"],
  },
  // A single declaration graph preserves class identity across the two entry points.
  {
    entry: { index: "src/index.ts", "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: { only: true },
    external: ["react", "@tanstack/react-query"],
  },
]);
