import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseJats,
  parseResearchHtml,
  parseResearchText,
  retrieveEvidence,
} from "../src/services/evidence.service";
import {
  allowedExternalUrl,
  fetchBounded,
  readLimited,
} from "../src/services/http.service";
import type { ClaimRow } from "../src/types";
import { bindings } from "./helpers";
import {
  syntheticClaimText,
  syntheticFetch,
  syntheticJats,
  syntheticPassage,
  syntheticPublication,
} from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
const claim: ClaimRow = {
  id: "synthetic-claim",
  document_id: "synthetic-document",
  claim_text: syntheticClaimText,
  page_number: null,
  claim_type: "statistical",
  extraction_confidence: null,
  citation_keys_json: "[]",
  created_at: new Date().toISOString(),
};
describe("legitimate full-text evidence and source identity", () => {
  it("preserves inline XML text order and actual section locations", () => {
    const xml = syntheticJats(
      "The pilot group demonstrated <italic>improvement</italic>, but no 30% increase is reported.",
    );
    expect(parseJats(xml, syntheticPublication())).toEqual([
      { text: syntheticPassage, location: "Results, paragraph 1" },
    ]);
    expect(() =>
      parseJats(
        syntheticJats(syntheticPassage, "10.9999/wrong-source"),
        syntheticPublication(),
      ),
    ).toThrow("does not match");
    expect(() =>
      parseJats(
        '<!DOCTYPE article [<!ENTITY attack "bad">]>' + syntheticJats(),
        syntheticPublication(),
      ),
    ).toThrow("unsupported entities");
  });
  it("reads supported HTML body paragraphs and excludes abstracts and unrelated landing pages", async () => {
    const html = `<html><head><meta name="citation_doi" content="10.9999/synthetic-pilot"><meta name="citation_title" content="Learning application pilot outcomes"></head><body><article class="article-body"><div class="abstract"><p>Abstract only synthetic text.</p></div><h2>Results</h2><p>The pilot group demonstrated <em>improvement</em>, but no 30% increase is reported.</p></article></body></html>`;
    const passages = await parseResearchHtml(
      html,
      syntheticPublication(),
      "https://elifesciences.org/articles/999999",
    );
    expect(passages).toEqual([
      { text: syntheticPassage, location: "Results, paragraph 1" },
    ]);
    expect(
      await parseResearchHtml(
        html.replace(
          'article class="article-body"',
          'article class="body main-article-body"',
        ),
        syntheticPublication(),
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC999999999/",
      ),
    ).toEqual(passages);
    await expect(
      parseResearchHtml(
        "<html><body><p>Unrelated landing page</p></body></html>",
        syntheticPublication(),
        "https://elifesciences.org/articles/999999",
      ),
    ).rejects.toMatchObject({ code: "source_identity_mismatch" });
    expect(
      parseResearchText(
        `DOI: 10.9999/synthetic-pilot\nLearning application pilot outcomes\n\nResults\n${syntheticPassage}`,
        syntheticPublication(),
      ),
    ).toHaveLength(1);
    expect(
      parseResearchText(
        `DOI: 10.9999/synthetic-pilot\nLearning application pilot outcomes\n\nAbstract\n${syntheticPassage}`,
        syntheticPublication(),
      ),
    ).toEqual([]);
    expect(
      parseJats(
        syntheticJats().replace(
          "<title>Results</title>",
          "<title>Abstract</title>",
        ),
        syntheticPublication(),
      ),
    ).toEqual([]);
  });
  it("retrieves Europe PMC full text by DOI and retains traceability", async () => {
    const fetch = syntheticFetch();
    vi.stubGlobal("fetch", fetch);
    const result = await retrieveEvidence(
      bindings(),
      claim,
      syntheticPublication({ openAccessUrl: null, locations: [] }),
      "synthetic-citation",
    );
    expect(result.evidence[0]).toMatchObject({
      evidence_text: syntheticPassage,
      source_id: "synthetic-source",
      evidence_type: "full_text",
      evidence_location: "Results, paragraph 1",
      retrieval_method: "europepmc_jats_xml",
    });
    expect(result.evidence[0].source_url).toContain(
      "/PMC999999999/fullTextXML",
    );
    expect(result.evidence[0].created_at).toBeTruthy();
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("query")).toContain(
      'DOI:"10.9999/synthetic-pilot"',
    );
  });
  it("labels abstract-only evidence when full text is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ resultList: { result: [] } })),
        ),
    );
    const result = await retrieveEvidence(
      bindings(),
      claim,
      syntheticPublication({
        locations: [],
        openAccessUrl: null,
        abstract: syntheticPassage,
      }),
      "synthetic-citation",
    );
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      evidence_type: "abstract",
      evidence_location: "Abstract only",
    });
    expect(
      result.limitations.some((n) => n.includes("could not be retrieved")),
    ).toBe(true);
  });
  it("blocks private hosts and redirect escapes, and bounds external responses", async () => {
    expect(() =>
      allowedExternalUrl("https://127.0.0.1/private", ["www.ebi.ac.uk"]),
    ).toThrow("outside");
    expect(() =>
      allowedExternalUrl("https://www.ebi.ac.uk:8443/private", [
        "www.ebi.ac.uk",
      ]),
    ).toThrow("outside");
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://169.254.169.254/metadata" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchBounded("https://www.ebi.ac.uk/source", {}, ["www.ebi.ac.uk"]),
    ).rejects.toMatchObject({ code: "unsafe_source_url" });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      readLimited(new Response("x".repeat(100)), 20),
    ).rejects.toMatchObject({ code: "external_too_large" });
    fetch.mockClear();
    const result = await retrieveEvidence(
      bindings(),
      claim,
      syntheticPublication({
        doi: null,
        openAccessUrl: "https://127.0.0.1/private",
        locations: [],
      }),
      "synthetic-citation",
    );
    expect(result.evidence).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
