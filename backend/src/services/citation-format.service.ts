import { ApiError } from "../middleware/error.middleware";
import type { Bindings } from "../types";
import { normalizeDoi, parseReference } from "./citation.service";
import { fetchBounded } from "./http.service";
import { searchCrossref } from "./research.service";

export async function formatCitation(
  env: Bindings,
  value: string,
  style: "apa" | "ieee",
) {
  const doi = normalizeDoi(value.trim());
  if (!doi)
    throw new ApiError(
      400,
      "invalid_doi",
      "Enter a valid DOI or https://doi.org link.",
    );
  const work = (
    await searchCrossref(env, parseReference("format", "[1]", `doi:${doi}`))
  ).find((candidate) => candidate.doi === doi);
  if (!work)
    throw new ApiError(
      404,
      "publication_not_found",
      "No Crossref publication metadata was found for this DOI. Nothing has been generated.",
    );
  if (
    !(await env.RESEARCH_RATE_LIMITER.limit({ key: "citation-format" })).success
  )
    throw new ApiError(
      429,
      "research_rate_limited",
      "Citation formatting reached its shared limit. Retry later.",
    );
  const url = new URL("https://citation.doi.org/format");
  url.searchParams.set("doi", doi);
  url.searchParams.set("style", style);
  url.searchParams.set("lang", "en-US");
  const result = await fetchBounded(
    url.href,
    {},
    ["citation.doi.org"],
    8000,
    20000,
  );
  const text = result.text.trim();
  if (
    !result.contentType.startsWith("text/plain") ||
    !text.toLowerCase().includes(doi) ||
    /<\/?(?:html|script|body)\b/i.test(text)
  )
    throw new ApiError(
      502,
      "invalid_citation_format",
      "The DOI service did not return a valid formatted citation. Nothing has been generated.",
    );
  return {
    doi,
    style,
    text,
    publication: {
      title: work.title,
      authors: work.authors,
      ...(work.year ? { year: work.year } : {}),
      doi,
      url: work.url ?? `https://doi.org/${doi}`,
    },
    notes: [
      "Generated from registered DOI metadata. Check author names, dates and publisher details before submission.",
      ...(!work.authors.length
        ? [
            "The registry did not supply authors; add them from the publisher record rather than guessing.",
          ]
        : []),
      ...(style === "ieee"
        ? ["The [1] label is a placeholder; renumber it for your document."]
        : []),
    ],
  };
}
