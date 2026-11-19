import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { documentAuth } from "../middleware/auth.middleware";
import { ApiError } from "../middleware/error.middleware";
import { uploadLimits } from "../schemas/document.schema";
import { documentDTO, uploadDocument } from "../services/document.service";
import { processExtraction, jobDTO } from "../services/claim.service";
import { Repository } from "../database/repository";
import { claimDTO, citationDTO } from "../services/report.service";
import { resolvePublication } from "../services/research.service";
import { z } from "zod";
import type { AppEnv } from "../types";
export const documentRoutes = new Hono<AppEnv>();
documentRoutes.post(
  "/",
  async (c, next) => {
    const limits = uploadLimits(c.env);
    return bodyLimit({
      maxSize: limits.pdf + limits.text + 65536,
      onError: () => {
        throw new ApiError(
          413,
          "request_too_large",
          "The multipart request exceeds the document size limits.",
        );
      },
    })(c, next);
  },
  async (c) => {
    if (!c.req.header("Content-Type")?.startsWith("multipart/form-data"))
      throw new ApiError(
        415,
        "multipart_required",
        "Use multipart/form-data with file, extractedText and pageCount.",
      );
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(
        400,
        "invalid_multipart",
        "The multipart upload could not be read.",
      );
    }
    return c.json(await uploadDocument(c.env, form), 201);
  },
);
documentRoutes.use("/:id", documentAuth);
documentRoutes.use("/:id/*", documentAuth);
documentRoutes.get("/:id", (c) => c.json(documentDTO(c.get("document"))));
documentRoutes.post("/:id/extract", async (c) =>
  c.json(await processExtraction(c.env, c.get("document")), 202),
);
documentRoutes.get("/:id/jobs/:jobId", async (c) => {
  const job = await new Repository(c.env.DB).jobById(
    c.get("document").id,
    z.uuid().parse(c.req.param("jobId")),
  );
  if (!job)
    throw new ApiError(
      404,
      "job_not_found",
      "Analysis job not found for this document.",
    );
  return c.json(jobDTO(job, c.get("document")));
});
documentRoutes.get("/:id/claims", async (c) => {
  const data = await new Repository(c.env.DB).reportData(c.get("document").id);
  return c.json(data.claims.map((claim) => claimDTO(claim, data)));
});
documentRoutes.post("/:id/citations/:citationId/resolve", async (c) => {
  const repo = new Repository(c.env.DB);
  const documentId = c.get("document").id;
  const citationId = z.uuid().parse(c.req.param("citationId"));
  if (!(await repo.job(documentId))?.extraction_complete)
    throw new ApiError(
      409,
      "extraction_incomplete",
      "Complete document extraction before checking references.",
    );
  const token = await repo.acquireLease(documentId);
  try {
    const data = await repo.reportData(documentId);
    const citation = data.citations.find((item) => item.id === citationId);
    if (!citation)
      throw new ApiError(
        404,
        "citation_not_found",
        "Reference not found in this document.",
      );
    await resolvePublication(c.env, { ...citation, resolved_at: null });
    await repo.assertLease(documentId, token);
    const updated = await repo.reportData(documentId);
    return c.json(
      citationDTO(
        updated.citations.find((item) => item.id === citationId)!,
        updated,
      ),
    );
  } finally {
    await repo.releaseLease(documentId, token).catch(() => {});
  }
});
