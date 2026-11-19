import { Hono } from "hono";
import { z } from "zod";
import { formatCitation } from "../services/citation-format.service";
import type { AppEnv } from "../types";

export const citationRoutes = new Hono<AppEnv>();
citationRoutes.get("/format", async (c) => {
  const input = z
    .object({
      doi: z.string().trim().min(1).max(2048),
      style: z.enum(["apa", "ieee"]),
    })
    .parse(c.req.query());
  return c.json(await formatCitation(c.env, input.doi, input.style));
});
