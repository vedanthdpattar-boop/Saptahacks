import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { app } from "../src";
import { Repository } from "../src/database/repository";
import { auth, bindings, syntheticText, upload } from "./helpers";
import { syntheticFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
// All documents, publications and formatting responses in this file are synthetic.
async function extracted(text = syntheticText) {
  const run = vi
    .fn()
    .mockResolvedValue({ response: { claims: [], citations: [] } });
  const b = bindings({ AI: { run } as unknown as Ai });
  const doc = await upload(b, text);
  expect(
    (
      await app.request(
        `/api/documents/${doc.id}/extract`,
        { method: "POST", headers: auth(doc.accessToken) },
        b,
      )
    ).status,
  ).toBe(202);
  const data = await new Repository(env.DB).reportData(doc.id);
  return { b, doc, citation: data.citations[0], run };
}
it("checks an unmapped bibliography without claims or evidence AI and enforces document ownership", async () => {
  vi.stubGlobal("fetch", syntheticFetch());
  const { b, doc, citation, run } = await extracted();
  const path = `/api/documents/${doc.id}/citations/${citation.id}/resolve`;
  const before = await app.request(
    `/api/documents/${doc.id}/report`,
    { headers: auth(doc.accessToken) },
    b,
  );
  expect(await before.json()).toMatchObject({
    claims: [],
    citations: [{ status: "unchecked" }],
  });
  expect((await app.request(path, { method: "POST" }, b)).status).toBe(401);
  const other = await extracted();
  expect(
    (
      await app.request(
        `/api/documents/${other.doc.id}/citations/${citation.id}/resolve`,
        { method: "POST", headers: auth(other.doc.accessToken) },
        b,
      )
    ).status,
  ).toBe(404);
  const result = await app.request(
    path,
    { method: "POST", headers: auth(doc.accessToken) },
    b,
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    documentId: doc.id,
    status: "matched",
    publication: { doi: "10.9999/synthetic-pilot" },
  });
  const saved = await new Repository(env.DB).reportData(doc.id);
  expect(saved.claims).toHaveLength(0);
  expect(saved.evidence).toHaveLength(0);
  expect(saved.verifications).toHaveLength(0);
  expect(
    (await new Repository(env.DB).document(doc.id))!.lease_token,
  ).toBeNull();
  expect(run).toHaveBeenCalledTimes(1);
});
it("keeps year discrepancies and unreachable metadata as review results", async () => {
  vi.stubGlobal("fetch", syntheticFetch());
  const { b, doc, citation } = await extracted(
    syntheticText.replace("(2023)", "(2024)"),
  );
  const path = `/api/documents/${doc.id}/citations/${citation.id}/resolve`;
  const result = await app.request(
    path,
    { method: "POST", headers: auth(doc.accessToken) },
    b,
  );
  expect(await result.json()).toMatchObject({
    status: "needs_review",
    publication: { year: 2023 },
    notes: expect.arrayContaining([
      expect.stringContaining("Printed year 2024"),
    ]),
  });
  const missing = await extracted(syntheticText.replaceAll("Learning application pilot outcomes", "Unreachable synthetic publication").replaceAll("10.9999/synthetic-pilot", "10.9999/unreachable"));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("synthetic timeout")),
  );
  const unresolved = await app.request(
    `/api/documents/${missing.doc.id}/citations/${missing.citation.id}/resolve`,
    { method: "POST", headers: auth(missing.doc.accessToken) },
    missing.b,
  );
  expect(await unresolved.json()).toMatchObject({
    status: "needs_review",
    publication: null,
    notes: expect.arrayContaining([expect.stringContaining("Crossref:")]),
  });
});
it("requires completed extraction before resolving a reference", async () => {
  const b = bindings(),
    doc = await upload(b);
  const result = await app.request(
    `/api/documents/${doc.id}/citations/${crypto.randomUUID()}/resolve`,
    { method: "POST", headers: auth(doc.accessToken) },
    b,
  );
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({
    error: { code: "extraction_incomplete" },
  });
});
it.each(["apa", "ieee"])(
  "formats %s from validated metadata through the allowlisted DOI service",
  async (style) => {
    const lookup = syntheticFetch();
    const text =
      style === "apa"
        ? "Smith, A. (2023). Learning application pilot outcomes. https://doi.org/10.9999/synthetic-pilot"
        : '[1] A. Smith, "Learning application pilot outcomes," 2023, doi: 10.9999/synthetic-pilot.';
    const fetch = vi.fn(async (value: string) =>
      new URL(value).hostname === "citation.doi.org"
        ? new Response(text, {
            headers: { "Content-Type": "text/plain; charset=UTF-8" },
          })
        : lookup(value),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await app.request(
      `/api/citations/format?${new URLSearchParams({ doi: "https://doi.org/10.9999/SYNTHETIC-PILOT", style })}`,
      {},
      bindings(),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      doi: "10.9999/synthetic-pilot",
      style,
      text,
      publication: { authors: ["Alice Smith"] },
    });
    const formatUrl = new URL(fetch.mock.calls[1][0]);
    expect(formatUrl.hostname).toBe("citation.doi.org");
    expect(formatUrl.searchParams.get("style")).toBe(style);
  },
);
it("rejects invalid DOI/style and malformed, wrong-DOI or missing formatting responses", async () => {
  const b = bindings();
  for (const query of [
    "doi=not-a-doi&style=apa",
    "doi=10.9999/test&style=script",
  ])
    expect(
      (await app.request(`/api/citations/format?${query}`, {}, b)).status,
    ).toBe(400);
  for (const text of [
    "<html>10.9999/synthetic-pilot</html>",
    "Wrong reference: 10.9999/other",
  ]) {
    const lookup = syntheticFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).hostname === "citation.doi.org"
          ? new Response(text, { headers: { "Content-Type": "text/plain" } })
          : lookup(url),
      ),
    );
    const result = await app.request(
      "/api/citations/format?doi=10.9999/synthetic-pilot&style=apa",
      {},
      b,
    );
    expect(result.status).toBe(502);
    expect(await result.json()).toMatchObject({
      error: { code: "invalid_citation_format" },
    });
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
  );
  expect(
    (
      await app.request(
        "/api/citations/format?doi=10.9999/missing&style=apa",
        {},
        b,
      )
    ).status,
  ).toBe(502);
});
