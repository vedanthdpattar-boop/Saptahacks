import { env } from "cloudflare:test";
import { vi } from "vitest";
import type { Bindings } from "../src/types";
import { app } from "../src";
export function bindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: env.DB,
    FILES: env.FILES,
    FILES_KV: env.FILES_KV,
    AI: { run: vi.fn() } as unknown as Ai,
    API_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    RESEARCH_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    AI_PROVIDER: "workers-ai",
    AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    FRONTEND_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}
// All test documents, references, API responses and passages are synthetic fixtures.
export const syntheticText =
  "A learning application improved examination scores by 30% [1].\n\nReferences\n[1] Smith, A. (2023). Learning application pilot outcomes. Synthetic Journal. doi:10.9999/synthetic-pilot";
export function uploadForm(text = syntheticText) {
  const form = new FormData();
  form.set(
    "file",
    new File(
      ["%PDF-1.7\nSynthetic test fixture, not a real publication."],
      "paper.pdf",
      { type: "application/pdf" },
    ),
  );
  form.set("extractedText", text);
  form.set("pageCount", "2");
  return form;
}
export async function upload(
  envBindings: Bindings = bindings(),
  text = syntheticText,
) {
  const response = await app.request(
    "/api/documents",
    { method: "POST", body: uploadForm(text) },
    envBindings,
  );
  if (response.status !== 201) throw new Error(await response.text());
  return (await response.json()) as { id: string; accessToken: string };
}
export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
