import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { ApiError, errorHandler } from "./middleware/error.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { documentRoutes } from "./routes/document.routes";
import { healthRoutes } from "./routes/health.routes";
import { claimRoutes } from "./routes/claim.routes";
import { reportRoutes } from "./routes/report.routes";
import { citationRoutes } from "./routes/citation.routes";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("X-Request-Id", c.get("requestId"));
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("*", secureHeaders());
app.use("/api/*", async (c, next) => {
  const origins = (
    c.env.FRONTEND_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const parsed = z.url().safeParse(origin);
    if (
      !parsed.success ||
      new URL(origin).origin !== origin ||
      !["http:", "https:"].includes(new URL(origin).protocol)
    )
      throw new ApiError(
        503,
        "invalid_cors_configuration",
        "Configure exact HTTP or HTTPS origins in FRONTEND_ORIGIN.",
      );
  }
  const origin = c.req.header("Origin");
  if (origin && !origins.includes(origin))
    throw new ApiError(
      403,
      "origin_not_allowed",
      "This browser origin is not configured for CiteVerify.",
    );
  return cors({
    origin: (o) => (origins.includes(o) ? o : undefined),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next);
});
app.use("/api/*", rateLimit);
app.use("/api/*", async (c, next) => {
  if (
    c.req.method !== "POST" ||
    c.req.path === "/api/documents" ||
    c.req.path === "/api/documents/"
  )
    return next();
  return bodyLimit({
    maxSize: 1024,
    onError: () => {
      throw new ApiError(
        413,
        "request_too_large",
        "This processing endpoint accepts at most 1024 request bytes.",
      );
    },
  })(c, next);
});
app.route("/api/health", healthRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/documents", reportRoutes);
app.route("/api/claims", claimRoutes);
app.route("/api/citations", citationRoutes);
app.notFound((c) =>
  c.json(
    {
      error: {
        code: "not_found",
        message: "Endpoint not found.",
        requestId: c.get("requestId"),
      },
    },
    404,
  ),
);
app.onError(errorHandler);
export default app;
