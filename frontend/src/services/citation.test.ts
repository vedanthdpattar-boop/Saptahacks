import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { validCitation, validFormattedCitation, validReport } from "./api";

// Synthetic reference and metadata; not a real publication.
const publication = {
  title: "Synthetic study",
  authors: ["Alice Smith"],
  year: 2023,
  doi: "10.9999/synthetic",
};
const citation = {
  id: "reference",
  documentId: "document",
  key: "[1]",
  referenceText: "Synthetic reference",
  doi: publication.doi,
  title: publication.title,
  authors: publication.authors,
  year: 2023,
  status: "matched",
  checkedAt: "2026-11-20T00:00:00Z",
  publication,
  alternatives: [],
  notes: [],
};
const formatted = {
  doi: publication.doi,
  style: "apa",
  text: "Smith, A. (2023). Synthetic study. https://doi.org/10.9999/synthetic",
  publication,
  notes: [],
};
beforeEach(() => {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("rejects invalid citation states and cross-document references in reports", () => {
  expect(validCitation(citation)).toBe(true);
  expect(validCitation({ ...citation, publication: null })).toBe(false);
  expect(validCitation({ ...citation, status: "unchecked" })).toBe(false);
  expect(
    validCitation({
      ...citation,
      alternatives: [{ ...publication, score: 2, selected: false }],
    }),
  ).toBe(false);
  const report = createDemoReport({ ...demoDocument, id: "document" });
  expect(validReport({ ...report, citations: [citation] })).toBe(true);
  expect(
    validReport({
      ...report,
      citations: [{ ...citation, documentId: "other" }],
    }),
  ).toBe(false);
  expect(validFormattedCitation(formatted)).toBe(true);
  expect(
    validFormattedCitation({
      ...formatted,
      publication: { ...publication, doi: "10.9999/other" },
    }),
  ).toBe(false);
});
it("authenticates reference checks and uses the selected DOI/style without sending a document token to formatting", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
  vi.stubGlobal("sessionStorage", { getItem: () => "k".repeat(43) });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(citation)))
    .mockResolvedValueOnce(new Response(JSON.stringify(formatted)));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("./api");
  await api.resolveCitation("document", "reference");
  await api.formatCitation("https://doi.org/10.9999/SYNTHETIC", "apa");
  expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe(
    `Bearer ${"k".repeat(43)}`,
  );
  expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBeNull();
  expect(new URL(fetch.mock.calls[1][0]).searchParams.get("style")).toBe("apa");
});
it("rejects another reference, DOI or style and never substitutes generated text on errors", async () => {
  vi.stubGlobal("sessionStorage", { getItem: () => "k".repeat(43) });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...citation, id: "other" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...formatted, style: "ieee" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...formatted,
            doi: "10.9999/other",
            publication: { ...publication, doi: "10.9999/other" },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 502 })),
  );
  const { api } = await import("./api");
  await expect(api.resolveCitation("document", "reference")).rejects.toThrow(
    "different reference",
  );
  await expect(api.formatCitation(publication.doi, "apa")).rejects.toThrow(
    "different formatting style",
  );
  await expect(api.formatCitation(publication.doi, "apa")).rejects.toThrow(
    "different DOI",
  );
  await expect(api.formatCitation(publication.doi, "apa")).rejects.toThrow(
    "HTTP 502",
  );
});
