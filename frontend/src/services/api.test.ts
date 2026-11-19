import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { safeSourceUrl, validClaim, validDocument, validReport } from "./api";
afterEach(() => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify(document)))
      .mockResolvedValueOnce(new Response(JSON.stringify(document)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ documentId: document.id })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(report.claims)))
      .mockResolvedValueOnce(new Response(JSON.stringify(report.claims[0])))
      .mockResolvedValueOnce(new Response(JSON.stringify(report)));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    await api.health();
    await api.upload({
      file: new File(["%PDF-test"], "paper.pdf", { type: "application/pdf" }),
      text: "extracted claim",
      pageCount: 2,
    });
    await api.document(document.id);
    const claims = await api.extract(document.id);
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
      "/api/documents/live-id/claims",
      `/api/claims/${report.claims[0].id}/verify`,
      "/api/documents/live-id/report",
    ]);
  });
});
