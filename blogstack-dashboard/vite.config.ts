import { defineConfig } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Workspace libraries can have their own development dependency versions.
  // Providers and hooks must resolve to the same React/Query context instances.
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./app/routes",
      generatedRouteTree: "./app/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3001,
    proxy: {
      // Proxy all API routes to the wrangler dev server so that session
      // cookies are issued for localhost:3001 (same origin as the dashboard).
      "^/(api|accounts|projects|public|health|draft|invitations|members|internal)": {
        target: "http://localhost:8787",
        changeOrigin: true,
        bypass(req) {
          // Let Vite serve the React app for browser navigation requests.
          // Only proxy XHR/fetch API calls (no text/html in Accept).
          const path = (req.url ?? "").split("?")[0]!;
          const dashboardRoute =
            /^\/projects(?:\/[^/]+(?:\/(?:api-keys|members|analytics|links|agents|settings|posts\/[^/]+))?)?\/?$/.test(
              path,
            );
          if (dashboardRoute && req.headers.accept?.includes("text/html"))
            return req.url;
          return undefined;
        },
      },
    },
  },
});
