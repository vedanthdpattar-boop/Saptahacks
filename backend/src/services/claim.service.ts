import {
  aiProvider,
  structuredOutput,
  type AiProvider,
} from "../ai/ai.provider";
import { extractionPrompt } from "../ai/extraction.prompt";
import { Repository } from "../database/repository";
import { ApiError } from "../middleware/error.middleware";
import { extractionSchema, type Extraction } from "../schemas/claim.schema";
import type { Bindings, ClaimRow, DocumentRow, JobRow } from "../types";
import {
  canonicalCitationKey,
  claimCitationKeys,
  mapClaimsToCitations,
  normalizedWords,
  parseReference,
  parseReferences,
} from "./citation.service";

export interface TextChunk {
  text: string;
  page: number | null;
}
export function splitDocumentText(
  text: string,
  pageCount: number,
): TextChunk[] {
  const pages = text.split("\f");
  const hasPages = pages.length === pageCount && pages.length > 1;
  const parts = hasPages ? pages : [text];
  const chunks: TextChunk[] = [];
  parts.forEach((part, page) => {
    let start = 0;
    while (start < part.length) {
      let end = Math.min(start + 8000, part.length);
      if (end < part.length) {
        const boundary = Math.max(
          part.lastIndexOf("\n\n", end),
          part.lastIndexOf(". ", end),
        );
        if (boundary > start + 4000) end = boundary + 1;
      }
      chunks.push({
        text: part.slice(start, end),
        page: hasPages ? page + 1 : null,
      });
      if (end === part.length) break;
      start = end - 500;
    }
  });
  if (chunks.length > 40)
    throw new ApiError(
      413,
      "too_many_chunks",
      "This document exceeds the 40-chunk processing limit. Upload a shorter document.",
    );
  return chunks;
}
export async function extractClaims(
  chunk: TextChunk,
  provider: AiProvider,
): Promise<Extraction> {
  return structuredOutput(
    provider,
    extractionPrompt,
    { documentText: chunk.text, suppliedPage: chunk.page },
    extractionSchema,
    (value) => {
      for (const claim of value.claims)
        if (!chunk.text.includes(claim.text))
          throw new Error("claim_not_verbatim");
      for (const citation of value.citations) {
        if (
          !chunk.text.includes(citation.referenceText) ||
          !canonicalCitationKey(citation.key)
        )
          throw new Error("reference_not_verbatim");
        const parsed = parseReference(
          "validation",
          citation.key,
          citation.referenceText,
        );
        const numeric = citation.key.match(/\d{1,3}/)?.[0];
        if (
          parsed.citation_key.startsWith("[") &&
          !new RegExp(`(?:\\[${numeric}\\]|^${numeric}[.)])`).test(
            citation.referenceText,
          )
        )
          throw new Error("reference_key_mismatch");
        if (!parsed.citation_key.startsWith("[")) {
          const [surname, year] = parsed.citation_key.split(":");
          if (
            normalizedWords(citation.referenceText)[0] !== surname ||
            !year.startsWith(String(parsed.publication_year))
          )
            throw new Error("reference_key_mismatch");
        }
      }
    },
  );
}
export function jobDTO(job: JobRow, document?: DocumentRow) {
  return {
    documentId: job.document_id,
    jobId: job.id,
    status: job.status,
    currentStage: job.current_stage,
    progress: Math.round(job.progress),
    processedChunks: job.cursor,
    totalChunks: job.total_chunks,
    extractionComplete: job.extraction_complete === 1,
    continuationRequired:
      !job.extraction_complete &&
      (job.status !== "running" ||
        (!!document && (document.lease_expires_at ?? 0) < Date.now())),
    errorMessage: job.error_message,
    updatedAt: job.updated_at,
  };
}
export async function processExtraction(env: Bindings, document: DocumentRow) {
  const repo = new Repository(env.DB);
  const existing = await repo.job(document.id);
  if (existing?.extraction_complete) return jobDTO(existing);
  const token = await repo.acquireLease(document.id);
  try {
    const text = env.FILES
      ? await (await env.FILES.get(document.text_key))?.text()
      : await env.FILES_KV?.get(document.text_key);
    if (!text)
      throw new ApiError(
        !env.FILES && env.FILES_KV ? 503 : 500,
        "document_text_missing",
        !env.FILES && env.FILES_KV
          ? "The uploaded text is not readable yet. Retry processing in a minute while private storage replicates."
          : "The stored document text is unavailable. Upload the document again.",
      );
    const chunks = splitDocumentText(text, document.page_count);
    const job = await repo.ensureJob(document.id, chunks.length);
    const parsed = parseReferences(document.id, text);
    if (parsed.diagnostics.some((d) => d.includes("150-reference")))
      throw new ApiError(
        413,
        "too_many_references",
        "The bibliography exceeds the 150-reference MVP limit. Upload a shorter document.",
      );
    if (job.cursor < chunks.length) {
      await repo.stage(document.id, "extraction");
      const chunk = chunks[job.cursor];
      const extracted = await extractClaims(chunk, aiProvider(env));
      const data = await repo.reportData(document.id);
      const uniqueTexts = new Set([
        ...data.claims.map((c) => c.claim_text),
        ...extracted.claims.map((c) => c.text),
      ]);
      if (uniqueTexts.size > 100)
        throw new ApiError(
          413,
          "too_many_claims",
          "The document exceeds the 100-claim processing limit. Upload a shorter document.",
        );
      const known = new Map(data.citations.map((c) => [c.citation_key, c]));
      const citations = job.cursor === 0 ? parsed.citations : [];
      for (const citation of citations)
        known.set(citation.citation_key, citation);
      const diagnostics: string[] = [
        ...JSON.parse(document.diagnostics_json),
        ...parsed.diagnostics,
      ];
      for (const citation of extracted.citations) {
        const row = parseReference(
          document.id,
          citation.key,
          citation.referenceText,
        );
        if (!known.has(row.citation_key)) {
          known.set(row.citation_key, row);
          citations.push(row);
        }
      }
      if (known.size > 150)
        throw new ApiError(
          413,
          "too_many_references",
          "The document exceeds the 150-reference processing limit.",
        );
      const claims: ClaimRow[] = extracted.claims.map((c) => ({
        id: crypto.randomUUID(),
        document_id: document.id,
        claim_text: c.text,
        page_number: chunk.page,
        claim_type: c.type,
        extraction_confidence: c.confidence,
        citation_keys_json: JSON.stringify([
          ...claimCitationKeys(text, c.text, c.citationKeys).keys(),
        ]),
        created_at: new Date().toISOString(),
      }));
      await repo.saveChunk(
        document.id,
        job,
        claims,
        citations,
        [...new Set(diagnostics)],
        token,
      );
    }
    const current = (await repo.job(document.id))!;
    if (
      current.cursor === current.total_chunks &&
      !current.extraction_complete
    ) {
      await repo.stage(document.id, "mapping");
      const data = await repo.reportData(document.id);
      const result = mapClaimsToCitations(text, data.claims, data.citations);
      await repo.assertLease(document.id, token);
      await repo.saveMappings(result.mappings);
      const row = (await repo.document(document.id))!;
      await repo.saveDiagnostics(document.id, [
        ...JSON.parse(row.diagnostics_json),
        ...result.diagnostics,
      ]);
      await repo.finishExtraction(document.id);
    }
    return jobDTO((await repo.job(document.id))!);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Claim extraction or storage failed. Retry to resume saved progress.";
    await repo.failJob(document.id, message, token).catch(() => {});
    throw error;
  } finally {
    await repo.releaseLease(document.id, token).catch(() => {});
  }
}
