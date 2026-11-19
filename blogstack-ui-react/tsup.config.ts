import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as const,
  dts: true,
  splitting: false,
  sourcemap: true,
  external: ["react", "react-dom"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts", "src/components/*.tsx"],
    clean: true,
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    entry: ["src/client.ts"],
    clean: false,
  },
]);
