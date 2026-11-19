import { createMiddleware } from "hono/factory";
import type { ErrorHandler } from "hono";
import { ZodError } from "zod/v4";
import { HTTPException } from "hono/http-exception";

import type { HonoEnv } from "../types.js";

/**
 * Global error handler — registered via app.onError().
 * Converts unhandled exceptions into JSON responses.
 */
export const errorHandler: ErrorHandler<HonoEnv> = (err, c) => {
  const requestId = c.var.requestId;
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
        code: err.status === 403 ? "FORBIDDEN" : "INVALID_REQUEST",
        requestId,
      },
      err.status,
    );
  }
  if (err instanceof ZodError)
    return c.json(
      {
        error: "Invalid request fields",
        code: "VALIDATION_ERROR",
        requestId,
        issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  const known = [
    "BLOG_LIMIT",
    "PEOPLE_LIMIT",
    "STORAGE_LIMIT",
    "POST_LIMIT",
    "USAGE_LIMIT",
    "SUBSCRIPTION_EXPIRED",
    "UPLOAD_SIZE",
    "SLUG_CONFLICT",
  ];
  const code = known.find(
    (value) => err.message.includes(value) || String(err.cause).includes(value),
  );
  if (code)
    return c.json(
      { error: code.toLowerCase().replaceAll("_", " "), code, requestId },
      code === "SUBSCRIPTION_EXPIRED" ? 402 : 409,
    );
  console.error(
    JSON.stringify({ requestId, message: err.message, stack: err.stack }),
  );
  return c.json(
    {
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
      requestId,
    },
    500,
  );
};

/**
 * Adds a X-Request-Id header to every response using the CF-Ray header.
 */
export const requestId = createMiddleware<HonoEnv>(async (c, next) => {
  const id = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.res.headers.set("x-request-id", id);
});
