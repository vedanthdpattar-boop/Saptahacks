import { Hono } from "hono";
import { Repository } from "../database/repository";
import { claimAuth } from "../middleware/auth.middleware";
import { claimDTO } from "../services/report.service";
import { processVerification } from "../services/verification.service";
import type { AppEnv } from "../types";
export const claimRoutes = new Hono<AppEnv>();
claimRoutes.use("/:id", claimAuth);
claimRoutes.use("/:id/*", claimAuth);
claimRoutes.get("/:id", async (c) => {
  const data = await new Repository(c.env.DB).reportData(c.get("document").id);
  return c.json(
    claimDTO(
      data.claims.find((claim) => claim.id === c.req.param("id"))!,
      data,
    ),
  );
});
claimRoutes.post("/:id/verify", async (c) =>
  c.json(
    await processVerification(c.env, c.get("document"), c.req.param("id")),
  ),
);
