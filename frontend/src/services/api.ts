import { createDemoReport, demoDocument } from "../mocks/demoData";
import {
  verdicts,
  type Claim,
  type ResearchDocument,
  type UploadDraft,
  type VerificationReport,
  type Citation,
  type CitationStyle,
  type FormattedCitation,
  type Publication,
} from "../types";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const documents = new Map<string, ResearchDocument>([
  [demoDocument.id, demoDocument],
]);

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const validPublication = (v: unknown): v is Publication =>
  object(v) &&
  typeof v.title === "string" &&
  strings(v.authors) &&
  (v.year === undefined ||
    (typeof v.year === "number" && Number.isInteger(v.year))) &&
  (v.doi === undefined || typeof v.doi === "string") &&
  (v.url === undefined || typeof v.url === "string");
export function validCitation(v: unknown): v is Citation {
  return (
    object(v) &&
    ["id", "documentId", "key", "referenceText"].every(
      (key) => typeof v[key] === "string" && v[key] !== "",
    ) &&
    (v.doi === null || typeof v.doi === "string") &&
    (v.title === null || typeof v.title === "string") &&
    strings(v.authors) &&
    (v.year === null ||
      (typeof v.year === "number" && Number.isInteger(v.year))) &&
    ["unchecked", "matched", "needs_review"].includes(String(v.status)) &&
    (v.status !== "matched" ||
      (v.publication !== null && v.checkedAt !== null)) &&
    (v.status !== "unchecked" || v.checkedAt === null) &&
    (v.checkedAt === null ||
      (typeof v.checkedAt === "string" &&
        Number.isFinite(Date.parse(v.checkedAt)))) &&
    (v.publication === null || validPublication(v.publication)) &&
    Array.isArray(v.alternatives) &&
    v.alternatives.every(
      (item) =>
        validPublication(item) &&
        object(item) &&
        typeof item.selected === "boolean" &&
        typeof item.score === "number" &&
        Number.isFinite(item.score) &&
        item.score >= 0 &&
        item.score <= 1,
    ) &&
    strings(v.notes)
  );
}
export function validFormattedCitation(v: unknown): v is FormattedCitation {
  return (
    object(v) &&
    typeof v.doi === "string" &&
    v.doi.length > 0 &&
    ["apa", "ieee"].includes(String(v.style)) &&
    typeof v.text === "string" &&
    v.text.trim().length > 0 &&
    validPublication(v.publication) &&
    v.publication.doi === v.doi &&
    strings(v.notes)
  );
}
export function validDocument(v: unknown): v is ResearchDocument {
  return (
    object(v) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    typeof v.size === "number" &&
    Number.isFinite(v.size) &&
    v.size >= 0 &&
    typeof v.pageCount === "number" &&
    Number.isInteger(v.pageCount) &&
    v.pageCount >= 0 &&
    typeof v.createdAt === "string" &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    ["uploaded", "processing", "complete", "error"].includes(
      String(v.status),
    ) &&
    ["demo", "live"].includes(String(v.mode))
  );
}
export function validClaim(v: unknown): v is Claim {
  if (!object(v)) return false;
  const p = v.publication;
  return (
    [
      "id",
      "documentId",
      "text",
      "citation",
      "explanation",
      "humanReview",
    ].every((k) => typeof v[k] === "string") &&
    v.id !== "" &&
    v.documentId !== "" &&
    verdicts.includes(v.verdict as Claim["verdict"]) &&
    (v.confidence === null ||
      (typeof v.confidence === "number" &&
        Number.isFinite(v.confidence) &&
        v.confidence >= 0 &&
        v.confidence <= 100)) &&
    (v.evidence === null || typeof v.evidence === "string") &&
    strings(v.limitations) &&
    (v.evidenceReference === undefined ||
      typeof v.evidenceReference === "string") &&
    (p === null || validPublication(p))
  );
}
export function validReport(v: unknown): v is VerificationReport {
  return (
    object(v) &&
    validDocument(v.document) &&
    Array.isArray(v.claims) &&
    v.claims.every(validClaim) &&
    v.claims.every(
      (c) => c.documentId === (v.document as ResearchDocument).id,
    ) &&
    typeof v.generatedAt === "string" &&
    Number.isFinite(Date.parse(v.generatedAt)) &&
    strings(v.limitations) &&
    (v.citations === undefined ||
      (Array.isArray(v.citations) &&
        v.citations.length <= 150 &&
        v.citations.every(validCitation) &&
        v.citations.every(
          (citation) =>
            citation.documentId === (v.document as ResearchDocument).id,
        ))) &&
    (v.citationDiagnostics === undefined || strings(v.citationDiagnostics))
  );
}
export function safeSourceUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const value = new URL(url);
    return ["https:", "http:"].includes(value.protocol)
      ? value.href
      : undefined;
  } catch {
    return undefined;
  }
}
function checked<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  endpoint: string,
): T {
  if (!guard(value))
    throw new ApiError(
      `The response from ${endpoint} does not match the frontend API contract. Ask the backend developer to check its format.`,
    );
  return value;
}
async function request(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  documentId?: string,
): Promise<unknown> {
  if (!baseUrl)
    throw new ApiError(
      "VITE_API_BASE_URL is missing. Configure the backend URL in frontend/.env.",
    );
  if (import.meta.env.VITE_DEMO_MODE !== "false")
    throw new ApiError(
      "Set VITE_DEMO_MODE to true for the demo or false for live APIs.",
    );
  const headers = new Headers(init.headers);
  if (documentId)
    headers.set("Authorization", `Bearer ${documentToken(documentId)}`);
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
    : AbortSignal.timeout(120000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "Could not reach the service. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = object(body) && object(body.error) ? body.error : undefined;
    throw new ApiError(
      `${typeof error?.message === "string" ? error.message.slice(0, 1000) : "This request could not be completed. Please retry."} (HTTP ${response.status})`,
      response.status,
      typeof error?.code === "string" ? error.code : undefined,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError(`${path} did not return valid JSON.`);
  }
}
const tokenKey = (id: string) => `citeverify.documentToken.${id}`;
function documentToken(id: string) {
  let token: string | null;
  try {
    token = sessionStorage.getItem(tokenKey(id));
  } catch {
    throw new ApiError(
      "Session storage is unavailable. Allow browser storage to access private documents.",
    );
  }
  if (!token)
    throw new ApiError(
      "The document access token is missing from this browser session. Upload the PDF in this session to analyse it.",
      401,
      "access_token_required",
    );
  return token;
}
interface AnalysisJob {
  documentId: string;
  jobId: string;
  status: string;
  progress: number;
  processedChunks: number;
  totalChunks: number;
  extractionComplete: boolean;
  continuationRequired: boolean;
  errorMessage: string | null;
}
function validJob(value: unknown): value is AnalysisJob {
  return (
    object(value) &&
    typeof value.documentId === "string" &&
    typeof value.jobId === "string" &&
    value.jobId.length > 0 &&
    ["queued", "running", "waiting", "complete", "error"].includes(
      String(value.status),
    ) &&
    typeof value.progress === "number" &&
    Number.isFinite(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 100 &&
    typeof value.processedChunks === "number" &&
    Number.isInteger(value.processedChunks) &&
    value.processedChunks >= 0 &&
    typeof value.totalChunks === "number" &&
    Number.isInteger(value.totalChunks) &&
    value.totalChunks >= 1 &&
    value.totalChunks <= 40 &&
    value.processedChunks <= value.totalChunks &&
    typeof value.extractionComplete === "boolean" &&
    typeof value.continuationRequired === "boolean" &&
    (value.errorMessage === null || typeof value.errorMessage === "string") &&
    (value.status !== "complete" ||
      (value.extractionComplete && value.progress === 100))
  );
}
function pause(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}
async function processingRequest(
  path: string,
  id: string,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      return await request(path, { method: "POST" }, signal, id);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 409 ||
        !["document_busy", "lease_expired"].includes(error.code ?? "")
      )
        throw error;
      await pause(2000, signal);
    }
  }
  throw new ApiError(
    "This document is still processing. Retry to resume its saved analysis.",
    409,
    "document_busy",
  );
}
function demoDoc(id: string) {
  const document = documents.get(id);
  if (!document)
    throw new ApiError(
      "This demo document is no longer in memory. Upload it again or open the sample analysis.",
      404,
    );
  return document;
}
const docPath = (id: string) => `/api/documents/${encodeURIComponent(id)}`;
export const api = {
  async formatCitation(
    doi: string,
    style: CitationStyle,
    signal?: AbortSignal,
  ) {
    const path = `/api/citations/format?${new URLSearchParams({ doi, style })}`;
    const result = checked(
      await request(path, {}, signal),
      validFormattedCitation,
      path,
    );
    if (result.style !== style)
      throw new ApiError(
        "The citation service returned a different formatting style.",
      );
    const expectedDoi = doi
      .trim()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .replace(/[.,;:]+$/, "")
      .toLowerCase();
    if (result.doi !== expectedDoi)
      throw new ApiError("The citation service returned a different DOI.");
    return result;
  },
  async resolveCitation(id: string, citationId: string, signal?: AbortSignal) {
    const path = `${docPath(id)}/citations/${encodeURIComponent(citationId)}/resolve`;
    const result = checked(
      await processingRequest(path, id, signal),
      validCitation,
      path,
    );
    if (result.id !== citationId || result.documentId !== id)
      throw new ApiError("The backend returned a different reference.");
    return result;
  },
  async health(signal?: AbortSignal) {
    if (DEMO_MODE) return { status: "ok", mode: "demo" };
    return checked(
      await request("/api/health", {}, signal),
      (v): v is { status: string } => object(v) && typeof v.status === "string",
      "/api/health",
    );
  },
  async upload(
    draft: UploadDraft,
    signal?: AbortSignal,
  ): Promise<ResearchDocument> {
    if (DEMO_MODE) {
      const document: ResearchDocument = {
        id: crypto.randomUUID(),
        name: draft.file.name,
        size: draft.file.size,
        pageCount: draft.pageCount,
        createdAt: new Date().toISOString(),
        status: "uploaded",
        mode: "demo",
      };
      documents.set(document.id, document);
      return document;
    }
    const form = new FormData();
    form.set("file", draft.file);
    form.set("extractedText", draft.text);
    form.set("pageCount", String(draft.pageCount));
    const result = checked(
      await request("/api/documents", { method: "POST", body: form }, signal),
      (v): v is ResearchDocument & { accessToken: string } =>
        validDocument(v) &&
        object(v) &&
        typeof v.accessToken === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(v.accessToken),
      "/api/documents",
    );
    try {
      sessionStorage.setItem(tokenKey(result.id), result.accessToken);
    } catch {
      throw new ApiError(
        "The document was uploaded, but its access token could not be saved. Allow session storage and upload again.",
      );
    }
    const { accessToken: _token, ...document } = result;
    return document;
  },
  async document(id: string, signal?: AbortSignal): Promise<ResearchDocument> {
    if (DEMO_MODE) return demoDoc(id);
    const document = checked(
      await request(docPath(id), {}, signal, id),
      validDocument,
      docPath(id),
    );
    if (document.id !== id)
      throw new ApiError("The backend returned a different document.");
    return document;
  },
  async extract(id: string, signal?: AbortSignal): Promise<Claim[]> {
    if (DEMO_MODE) return createDemoReport(demoDoc(id)).claims;
    const path = `${docPath(id)}/extract`;
    const checkedJob = (value: unknown, endpoint: string) =>
      checked(
        value,
        (v): v is AnalysisJob => validJob(v) && v.documentId === id,
        endpoint,
      );
    let job = checkedJob(await processingRequest(path, id, signal), path);
    for (let step = 0; !job.extractionComplete; step++) {
      if (step >= 200)
        throw new ApiError(
          "Extraction has not finished. Retry to resume from saved progress.",
        );
      await pause(job.continuationRequired ? 250 : 2000, signal);
      const statusPath = `${docPath(id)}/jobs/${encodeURIComponent(job.jobId)}`;
      const status = checkedJob(
        await request(statusPath, {}, signal, id),
        statusPath,
      );
      if (status.jobId !== job.jobId)
        throw new ApiError("The backend returned a different analysis job.");
      if (status.status === "error")
        throw new ApiError(
          status.errorMessage ??
            "Extraction failed. Retry to resume saved progress.",
        );
      job = status.continuationRequired
        ? checkedJob(await processingRequest(path, id, signal), path)
        : status;
    }
    return api.claims(id, signal);
  },
  async claims(id: string, signal?: AbortSignal): Promise<Claim[]> {
    if (DEMO_MODE) return createDemoReport(demoDoc(id)).claims;
    const path = `${docPath(id)}/claims`;
    return checked(
      await request(path, {}, signal, id),
      (v): v is Claim[] =>
        Array.isArray(v) &&
        v.every(validClaim) &&
        v.every((c) => c.documentId === id),
      path,
    );
  },
  async claim(
    id: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<Claim> {
    if (DEMO_MODE) {
      const claim = createDemoReport(demoDoc(documentId)).claims.find(
        (c) => c.id === id,
      );
      if (!claim) throw new ApiError("Claim not found.", 404);
      return claim;
    }
    const path = `/api/claims/${encodeURIComponent(id)}`;
    const claim = checked(
      await request(path, {}, signal, documentId),
      validClaim,
      path,
    );
    if (claim.id !== id || claim.documentId !== documentId)
      throw new ApiError("The backend returned a different claim.");
    return claim;
  },
  async verify(claim: Claim, signal?: AbortSignal): Promise<Claim> {
    if (DEMO_MODE) return claim;
    const path = `/api/claims/${encodeURIComponent(claim.id)}/verify`;
    const result = checked(
      await processingRequest(path, claim.documentId, signal),
      validClaim,
      path,
    );
    if (result.id !== claim.id || result.documentId !== claim.documentId)
      throw new ApiError("Verification returned a different claim.");
    return result;
  },
  async report(id: string, signal?: AbortSignal): Promise<VerificationReport> {
    if (DEMO_MODE) {
      const report = createDemoReport(demoDoc(id));
      documents.set(id, report.document);
      return report;
    }
    const report = checked(
      await request(`${docPath(id)}/report`, {}, signal, id),
      validReport,
      `${docPath(id)}/report`,
    );
    if (report.document.id !== id)
      throw new ApiError(
        "The backend returned a report for a different document.",
      );
    return report;
  },
  recentDocuments(): ResearchDocument[] {
    return DEMO_MODE ? [...documents.values()].reverse() : [];
  },
};
