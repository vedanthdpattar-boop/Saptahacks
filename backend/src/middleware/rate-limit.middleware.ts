import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { ApiError } from "./error.middleware";
export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "OPTIONS" || c.req.path === "/api/health") return next();
  if (!c.env.API_RATE_LIMITER)
    throw new ApiError(
      503,
      "rate_limit_unavailable",
      "The shared API rate-limit binding is unavailable.",
    );
  const { success } = await c.env.API_RATE_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "local-development",
  });
  if (!success) {
    c.header("Retry-After", "60");
    throw new ApiError(
      429,
      "rate_limited",
      "Too many requests. Retry in one minute.",
    );
  }
  await next();
};
