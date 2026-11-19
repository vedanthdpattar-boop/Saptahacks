import { Hono } from "hono";
import { Repository } from "../database/repository";
import { documentAuth } from "../middleware/auth.middleware";
import { generateReport } from "../services/report.service";
import type { AppEnv } from "../types";
export const reportRoutes = new Hono<AppEnv>();
reportRoutes.use("/:id/report", documentAuth);
reportRoutes.get("/:id/report", async (c) =>
  c.json(await generateReport(new Repository(c.env.DB), c.get("document"))),
);
