import { Hono } from "hono";
import type { AppEnv } from "../types";
export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({
    status: "ok",
    service: "citeverify-api",
    mode: "live",
    aiProvider: c.env.AI_PROVIDER ?? "workers-ai",
  });
});
