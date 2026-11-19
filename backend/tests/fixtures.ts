import { vi } from "vitest";
import type { PublicationCandidate } from "../src/types";
// Entirely synthetic test data. None of these identifiers or passages are real publications.
export const syntheticClaimText =
  "A learning application improved examination scores by 30%.";
export const syntheticPassage =
  "The pilot group demonstrated improvement, but no 30% increase is reported.";
export const syntheticExtraction = {
  claims: [
    {
      text: "A learning application improved examination scores by 30% [1].",
      type: "statistical",
      page: 99,
      citationKeys: ["[1]"],
      confidence: 0.8,
    },
  ],
  citations: [],
};
export function syntheticPublication(
  overrides: Partial<PublicationCandidate> = {},
): PublicationCandidate {
  return {
    id: "synthetic-source",
    provider: "openalex",
    externalId: "https://openalex.org/W999999999999",
    title: "Learning application pilot outcomes",
    doi: "10.9999/synthetic-pilot",
    authors: ["Alice Smith"],
    abstract: null,
    year: 2023,
    url: "https://doi.org/10.9999/synthetic-pilot",
    openAccessUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC999999999/",
    accessStatus: "open_access",
    locations: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC999999999/"],
    providers: ["openalex"],
    ...overrides,
  };
}
export function syntheticJats(
  passage = syntheticPassage,
  doi = "10.9999/synthetic-pilot",
) {
  return `<?xml version="1.0"?><article><front><article-meta><article-id pub-id-type="doi">${doi}</article-id><title-group><article-title>Learning application pilot outcomes</article-title></title-group><contrib-group><contrib><name><surname>Smith</surname></name></contrib></contrib-group></article-meta></front><body><sec><title>Results</title><p>${passage}</p></sec></body></article>`;
}
export function syntheticFetch() {
  return vi.fn(async (value: string) => {
    const url = new URL(value);
    if (url.hostname === "api.crossref.org")
      return new Response(
        JSON.stringify({
          message: {
            DOI: "10.9999/synthetic-pilot",
            title: ["Learning application pilot outcomes"],
            author: [{ given: "Alice", family: "Smith" }],
            issued: { "date-parts": [[2023]] },
          },
        }),
      );
    if (url.hostname === "api.openalex.org")
      return new Response(
        JSON.stringify({
          id: "https://openalex.org/W999999999999",
          title: "Learning application pilot outcomes",
          doi: "https://doi.org/10.9999/synthetic-pilot",
          publication_year: 2023,
          authorships: [{ author: { display_name: "Alice Smith" } }],
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
      );
    if (url.pathname.endsWith("/search"))
      return new Response(
        JSON.stringify({
          resultList: {
            result: [
              {
                pmcid: "PMC999999999",
                doi: "10.9999/synthetic-pilot",
                isOpenAccess: "Y",
              },
            ],
          },
        }),
      );
    if (url.pathname.endsWith("/fullTextXML"))
      return new Response(syntheticJats(), {
        headers: { "Content-Type": "application/xml" },
      });
    return new Response("Synthetic source not found", { status: 404 });
  });
}
export function syntheticAiRun() {
  return vi.fn(
    async (_model: string, request: { messages: { content: string }[] }) => {
      const input = JSON.parse(request.messages[1].content);
      if (input.documentText) return { response: syntheticExtraction };
      const passage = input.passages.find(
        (p: { passage: string }) => p.passage === syntheticPassage,
      );
      return {
        response: {
          verdict: "partially_supported",
          confidence: 0.78,
          explanation:
            "The synthetic pilot reports improvement, but it does not establish an exact 30% increase in examination scores.",
          evidence: [
            {
              passage: passage.passage,
              sourceId: passage.sourceId,
              location: passage.location,
              relation: "partially_supports",
            },
          ],
          limitations: [
            "Synthetic fixture: exact numerical increase is not established.",
          ],
          requiresHumanReview: true,
        },
      };
    },
  );
}
