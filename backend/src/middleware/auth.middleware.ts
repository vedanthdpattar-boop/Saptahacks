import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { Repository } from "../database/repository";
import type { AppEnv, DocumentRow } from "../types";
import { ApiError } from "./error.middleware";

export async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function authorize(document: DocumentRow | null, header?: string) {
  if (!document)
    throw new ApiError(404, "document_not_found", "Document not found.");
  const token = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token)
    throw new ApiError(
      401,
      "access_token_required",
      "The document access token is missing. Open this document in the browser session that uploaded it.",
    );
  const hash = await hashToken(token);
  const supplied = new TextEncoder().encode(hash);
  const stored = new TextEncoder().encode(document.access_token_hash);
  if (!crypto.subtle.timingSafeEqual(supplied, stored))
    throw new ApiError(
      401,
      "invalid_access_token",
      "The document access token is invalid.",
    );
  return document;
}
export const documentAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = z.uuid().parse(c.req.param("id"));
  c.set(
    "document",
    await authorize(
      await new Repository(c.env.DB).document(id),
      c.req.header("Authorization"),
    ),
  );
  await next();
};
export const claimAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = z.uuid().parse(c.req.param("id"));
  const repo = new Repository(c.env.DB);
  const claim = await repo.claim(id);
  if (!claim) throw new ApiError(404, "claim_not_found", "Claim not found.");
  c.set(
    "document",
    await authorize(
      await repo.document(claim.document_id),
      c.req.header("Authorization"),
    ),
  );
  await next();
};
