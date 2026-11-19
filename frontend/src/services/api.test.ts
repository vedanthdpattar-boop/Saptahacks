import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { safeSourceUrl, validClaim, validDocument, validReport } from "./api";
const syntheticToken = "k".repeat(43);
beforeEach(() => {
  const values = new Map(
    ["real-document", "x", "live-id"].map((id) => [
      `citeverify.documentToken.${id}`,
      syntheticToken,
    ]),
  );
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("API trust boundaries", () => {
  it("accepts the sample and rejects invalid values and cross-document claims", () => {
    const report = createDemoReport(demoDocument);
    expect(validDocument(demoDocument)).toBe(true);
    expect(validReport(report)).toBe(true);
    expect(
      validReport({
        ...report,
        claims: [{ ...report.claims[0], documentId: "other" }],
      }),
    ).toBe(false);
    for (const confidence of [-1, 101, NaN, "94"])
      expect(validClaim({ ...report.claims[0], confidence })).toBe(false);
    expect(validClaim({ ...report.claims[0], confidence: null })).toBe(true);
    expect(validClaim({ ...report.claims[0], id: "" })).toBe(false);
    expect(
      validClaim({
        ...report.claims[0],
        publication: { title: "x", authors: "invalid" },
      }),
    ).toBe(false);
    expect(validDocument({ ...demoDocument, pageCount: 1.5 })).toBe(false);
    expect(validDocument({ ...demoDocument, createdAt: "invalid" })).toBe(
      false,
    );
  });
  it("allows only absolute HTTP source links", () => {
    expect(safeSourceUrl("https://doi.org/10.1234/example")).toBe(
      "https://doi.org/10.1234/example",
    );
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/x",
      "/relative",
      "invalid",
    ])
      expect(safeSourceUrl(url)).toBeUndefined();
  });
  it("keeps all demo findings labelled and does not call a backend", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    const report = await api.report(demoDocument.id);
    expect(report.document.mode).toBe("demo");
    expect(report.limitations.join(" ")).toContain("illustrative demo data");
    expect(new Set(report.claims.map((c) => c.verdict)).size).toBe(6);
    expect(
      report.claims.every((c) => !c.publication?.url && !c.publication?.doi),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await expect(api.report("unknown")).rejects.toThrow("no longer in memory");
  });
  it.each([404, 500])(
    "does not substitute demo data on HTTP %s in live mode",
    async (status) => {
      vi.stubEnv("VITE_DEMO_MODE", "false");
      vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );
      const { api } = await import("./api");
      await expect(api.report("real-document")).rejects.toThrow(
        `HTTP ${status}`,
      );
      expect(api.recentDocuments()).toEqual([]);
    },
  );
  it("rejects malformed live reports and network failures", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockRejectedValueOnce(new TypeError("network"));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    await expect(api.report("x")).rejects.toThrow("API contract");
    await expect(api.report("x")).rejects.toThrow("Could not reach");
  });
  it("sends multipart upload fields and uses all requested live endpoints", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    const document = { ...demoDocument, id: "live-id", mode: "live" as const };
    const report = createDemoReport(document);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...document, accessToken: syntheticToken }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(document)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: document.id,
            jobId: "synthetic-job",
            status: "waiting",
            progress: 20,
            processedChunks: 1,
            totalChunks: 2,
            extractionComplete: false,
            continuationRequired: true,
            errorMessage: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: document.id,
            jobId: "synthetic-job",
            status: "waiting",
            progress: 20,
            processedChunks: 1,
            totalChunks: 2,
            extractionComplete: false,
            continuationRequired: true,
            errorMessage: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: document.id,
            jobId: "synthetic-job",
            status: "waiting",
            progress: 45,
            processedChunks: 2,
            totalChunks: 2,
            extractionComplete: true,
            continuationRequired: false,
            errorMessage: null,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(report.claims)))
      .mockResolvedValueOnce(new Response(JSON.stringify(report.claims[0])))
      .mockResolvedValueOnce(new Response(JSON.stringify(report.claims[0])))
      .mockResolvedValueOnce(new Response(JSON.stringify(report)));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    await api.health();
    const uploaded = await api.upload({
      file: new File(["%PDF-test"], "paper.pdf", { type: "application/pdf" }),
      text: "extracted claim",
      pageCount: 2,
    });
    expect(uploaded).not.toHaveProperty("accessToken");
    expect(
      sessionStorage.getItem(`citeverify.documentToken.${document.id}`),
    ).toBe(syntheticToken);
    await api.document(document.id);
    const claims = await api.extract(document.id);
    await api.claim(claims[0].id, document.id);
    await api.verify(claims[0]);
    await api.report(document.id);
    const form = fetch.mock.calls[1][1].body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.get("extractedText")).toBe("extracted claim");
    expect(form.get("pageCount")).toBe("2");
    expect(fetch.mock.calls.map((call) => new URL(call[0]).pathname)).toEqual([
      "/api/health",
      "/api/documents",
      "/api/documents/live-id",
      "/api/documents/live-id/extract",
      "/api/documents/live-id/jobs/synthetic-job",
      "/api/documents/live-id/extract",
      "/api/documents/live-id/claims",
      `/api/claims/${report.claims[0].id}`,
      `/api/claims/${report.claims[0].id}/verify`,
      "/api/documents/live-id/report",
    ]);
    expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBeNull();
    for (const [, request] of fetch.mock.calls.slice(2))
      expect(request.headers.get("Authorization")).toBe(
        `Bearer ${syntheticToken}`,
      );
  });
  it("requires a session token and rejects uploads without a valid token", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...demoDocument, mode: "live" })),
      );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    await expect(api.document("new-session")).rejects.toThrow(
      "access token is missing",
    );
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      api.upload({
        file: new File(["%PDF-1.7"], "paper.pdf", { type: "application/pdf" }),
        text: "Synthetic extracted claim.",
        pageCount: 1,
      }),
    ).rejects.toThrow("API contract");
  });
  it("surfaces backend processing errors without substituting demo results", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_ai_output",
                message: "The AI response failed evidence validation twice.",
              },
            }),
            { status: 502 },
          ),
        ),
    );
    const { api } = await import("./api");
    await expect(api.extract("live-id")).rejects.toThrow(
      "failed evidence validation twice",
    );
  });
  it("cancels job polling promptly when the analysis is cancelled", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documentId: "live-id",
            jobId: "synthetic-job",
            status: "running",
            progress: 0,
            processedChunks: 0,
            totalChunks: 2,
            extractionComplete: false,
            continuationRequired: false,
            errorMessage: null,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    const controller = new AbortController();
    const pending = api.extract("live-id", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries a document lease conflict and retains the claim's identity", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8787");
    const claim = createDemoReport({
      ...demoDocument,
      id: "live-id",
      mode: "live",
    }).claims[0];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "document_busy", message: "Already processing." },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim)));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    vi.useFakeTimers();
    const pending = api.verify(claim);
    await vi.advanceTimersByTimeAsync(2001);
    await expect(pending).resolves.toMatchObject({
      id: claim.id,
      documentId: "live-id",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
