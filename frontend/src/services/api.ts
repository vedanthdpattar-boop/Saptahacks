import { createDemoReport, demoDocument } from "../mocks/demoData";
import {
  verdicts,
  type Claim,
  type ResearchDocument,
  type UploadDraft,
  type VerificationReport,
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
  ) {
    super(message);
    this.name = "ApiError";
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
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
    (p === null ||
      (object(p) &&
        typeof p.title === "string" &&
        strings(p.authors) &&
        (p.year === undefined ||
          (typeof p.year === "number" && Number.isInteger(p.year))) &&
        (p.doi === undefined || typeof p.doi === "string") &&
        (p.url === undefined || typeof p.url === "string")))
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
    strings(v.limitations)
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
): Promise<unknown> {
  if (!baseUrl)
    throw new ApiError(
      "VITE_API_BASE_URL is missing. Configure the backend URL in frontend/.env.",
    );
  if (import.meta.env.VITE_DEMO_MODE !== "false")
    throw new ApiError(
      "Set VITE_DEMO_MODE to true for the demo or false for live APIs.",
    );
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
    : AbortSignal.timeout(60000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, signal: combined });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      `Could not reach ${path}. Check that the backend is running, allows this origin through CORS, and responds within 60 seconds.`,
    );
  }
  if (!response.ok)
    throw new ApiError(
      `${path} returned HTTP ${response.status}. ${response.status === 404 ? "This endpoint is not available yet." : "The backend could not complete this request."} No demo results have been substituted.`,
      response.status,
    );
  try {
    return await response.json();
  } catch {
    throw new ApiError(`${path} did not return valid JSON.`);
  }
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
    return checked(
      await request("/api/documents", { method: "POST", body: form }, signal),
      validDocument,
      "/api/documents",
    );
  },
  async document(id: string, signal?: AbortSignal): Promise<ResearchDocument> {
    if (DEMO_MODE) return demoDoc(id);
    const document = checked(
      await request(docPath(id), {}, signal),
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
    checked(
      await request(path, { method: "POST" }, signal),
      (v): v is { documentId: string } => object(v) && v.documentId === id,
      path,
    );
    return api.claims(id, signal);
  },
  async claims(id: string, signal?: AbortSignal): Promise<Claim[]> {
    if (DEMO_MODE) return createDemoReport(demoDoc(id)).claims;
    const path = `${docPath(id)}/claims`;
    return checked(
      await request(path, {}, signal),
      (v): v is Claim[] =>
        Array.isArray(v) &&
        v.every(validClaim) &&
        v.every((c) => c.documentId === id),
      path,
    );
  },
  async verify(claim: Claim, signal?: AbortSignal): Promise<Claim> {
    if (DEMO_MODE) return claim;
    const path = `/api/claims/${encodeURIComponent(claim.id)}/verify`;
    const result = checked(
      await request(path, { method: "POST" }, signal),
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
      await request(`${docPath(id)}/report`, {}, signal),
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
