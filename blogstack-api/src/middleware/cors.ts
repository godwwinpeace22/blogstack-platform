import { createMiddleware } from "hono/factory";
import { cors as honoCors } from "hono/cors";

import type { HonoEnv } from "../types.js";

/**
 * CORS middleware — allows the dashboard origin and credentials (session cookie).
 * In development additional localhost origins are permitted.
 */
export function cors() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (c.req.path.startsWith("/public/"))
      return honoCors({
        origin: "*",
        allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
        exposeHeaders: ["X-Request-Id"],
      })(c, next);
    const allowedOrigins = [
      c.env.FRONTEND_URL,
      "http://localhost:3001",
      "http://localhost:3000",
    ];

    const origin = c.req.header("origin") ?? "";
    const allowed = allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0]!;

    return honoCors({
      origin: allowed,
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "X-API-Key",
        "Authorization",
        "X-BlogStack-Account-Id",
      ],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["X-Request-Id"],
      maxAge: 86400,
    })(c, next);
  });
}
