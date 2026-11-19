import { afterEach, describe, expect, it, vi } from "vitest";
import {
  matchPublication,
  reconstructAbstract,
  searchCrossref,
  searchOpenAlex,
} from "../src/services/research.service";
import { parseReference } from "../src/services/citation.service";
import { bindings } from "./helpers";
import { syntheticPublication } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
describe("publication lookup and conservative matching", () => {
  it("uses DOI endpoints and Crossref contact headers, and validates OpenAlex metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: {
              DOI: "10.9999/synthetic-pilot",
              title: ["Learning application pilot outcomes"],
              author: [{ given: "Alice", family: "Smith" }],
              issued: { "date-parts": [[2023]] },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "https://openalex.org/W999999999999",
            display_name: "Learning application pilot outcomes",
            doi: "https://doi.org/10.9999/synthetic-pilot",
            publication_year: 2023,
            authorships: [{ author: { display_name: "Alice Smith" } }],
            abstract_inverted_index: {
              Synthetic: [0],
              pilot: [1],
              improved: [2],
              outcomes: [3],
            },
            open_access: {
              is_oa: true,
              oa_url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC999999999/",
            },
            locations: [
              {
                is_oa: true,
                landing_page_url:
                  "https://pmc.ncbi.nlm.nih.gov/articles/PMC999999999/",
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const citation = parseReference(
      "synthetic",
      "[1]",
      "[1] Smith, A. (2023). Learning application pilot outcomes. doi:10.9999/synthetic-pilot",
    );
    const b = bindings({
      CROSSREF_CONTACT_EMAIL: "team@example.invalid",
      OPENALEX_API_KEY: "synthetic-test-key",
    });
    expect((await searchCrossref(b, citation))[0]).toMatchObject({
      doi: citation.doi,
      year: 2023,
      authors: ["Alice Smith"],
    });
    const oa = (await searchOpenAlex(b, citation))[0];
    expect(oa.abstract).toBe("Synthetic pilot improved outcomes");
    expect(oa.accessStatus).toBe("open_access");
    expect(fetch.mock.calls[0][1].headers["User-Agent"]).toContain(
      "mailto:team@example.invalid",
    );
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("api_key")).toBe(
      "synthetic-test-key",
    );
    expect(b.RESEARCH_RATE_LIMITER.limit).toHaveBeenCalledTimes(2);
  });
  it("supports bibliographic search without a DOI", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { items: [] } })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetch);
    const citation = parseReference(
      "synthetic",
      "[1]",
      "[1] Smith, A. (2023). Learning application pilot outcomes. Synthetic Journal.",
    );
    await searchCrossref(bindings(), citation);
    await searchOpenAlex(bindings(), citation);
    expect(
      new URL(fetch.mock.calls[0][0]).searchParams.get("query.bibliographic"),
    ).toContain("Learning application");
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("search")).toBe(
      "Learning application pilot outcomes",
    );
  });
  it("rejects a wrong DOI, conflicting DOI metadata, and ambiguous titles rather than choosing the first result", () => {
    const citation = parseReference(
      "synthetic",
      "[1]",
      "[1] Smith, A. (2023). Learning application pilot outcomes. doi:10.9999/synthetic-pilot",
    );
    const unrelated = syntheticPublication({
      id: "wrong-source",
      doi: "10.9999/wrong",
      title: "Unrelated synthetic agriculture",
    });
    expect(
      matchPublication(citation, [unrelated, syntheticPublication()]).selected
        ?.id,
    ).toBe("synthetic-source");
    expect(matchPublication(citation, [unrelated]).selected).toBeNull();
    expect(
      matchPublication(citation, [
        syntheticPublication({ title: "Unrelated synthetic agriculture" }),
      ]).selected,
    ).toBeNull();
    const noDoi = { ...citation, doi: null };
    expect(
      matchPublication(noDoi, [
        syntheticPublication(),
        syntheticPublication({
          id: "alternative",
          externalId: "https://openalex.org/W888888888888",
          doi: "10.9999/alternative",
        }),
      ]).selected,
    ).toBeNull();
  });
  it("does not accept invalid API shapes or fabricate missing abstracts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ id: "invalid", title: "Untrusted result" }),
          ),
        ),
    );
    const citation = parseReference(
      "synthetic",
      "[1]",
      "[1] Smith (2023). Learning application pilot outcomes. doi:10.9999/synthetic-pilot",
    );
    expect(await searchOpenAlex(bindings(), citation)).toEqual([]);
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract({ third: [2], first: [0], second: [1] })).toBe(
      "first second third",
    );
  });
});
