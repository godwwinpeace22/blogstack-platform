import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.tsx" },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  banner: { js: '"use client";' },
  external: [
    "react",
    "react-dom",
    "@blocknote/core",
    "@blocknote/react",
    "@blocknote/mantine",
  ],
});
