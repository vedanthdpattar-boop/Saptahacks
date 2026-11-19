import { z } from "zod";
import { publicationFromRow, Repository } from "../database/repository";
import { ApiError } from "../middleware/error.middleware";
import type { Bindings, CitationRow, PublicationCandidate } from "../types";
import { normalizeDoi, normalizedWords } from "./citation.service";
import { researchJson } from "./http.service";

const crossrefWork = z.object({
  DOI: z.string(),
  title: z.array(z.string()).min(1),
  URL: z.string().optional(),
  author: z
    .array(
      z.object({ given: z.string().optional(), family: z.string().optional() }),
    )
    .optional(),
  issued: z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  abstract: z.string().optional(),
});
const openalexWork = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  publication_year: z.number().int().nullable().optional(),
  authorships: z
    .array(
      z.object({
        author: z.object({ display_name: z.string().nullable().optional() }),
      }),
    )
    .optional(),
  abstract_inverted_index: z
    .record(z.string(), z.array(z.number().int().min(0).max(10000)))
    .nullable()
    .optional(),
  open_access: z
    .object({
      is_oa: z.boolean().optional(),
      oa_url: z.string().nullable().optional(),
    })
    .optional(),
  locations: z
    .array(
      z.object({
        is_oa: z.boolean().optional(),
        landing_page_url: z.string().nullable().optional(),
        pdf_url: z.string().nullable().optional(),
      }),
    )
    .optional(),
  primary_location: z
    .object({ landing_page_url: z.string().nullable().optional() })
    .nullable()
    .optional(),
});
const safeLink = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const validYear = (year?: number | null) =>
  year && Number.isInteger(year) && year >= 1500 && year <= 2100 ? year : null;
const plainAbstract = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);

export async function searchCrossref(
  env: Bindings,
  citation: CitationRow,
): Promise<PublicationCandidate[]> {
  const url = new URL(
    citation.doi
      ? `https://api.crossref.org/works/${encodeURIComponent(citation.doi)}`
      : "https://api.crossref.org/works",
  );
  if (!citation.doi) {
    url.searchParams.set(
      "query.bibliographic",
      citation.reference_text.slice(0, 2000),
    );
    url.searchParams.set("rows", "5");
  }
  const contact = env.CROSSREF_CONTACT_EMAIL?.trim();
  if (contact && !z.email().safeParse(contact).success)
    throw new ApiError(
      503,
      "invalid_crossref_contact",
      "Configure a valid CROSSREF_CONTACT_EMAIL.",
    );
  if (contact) url.searchParams.set("mailto", contact);
  const response = await researchJson(env, url.href, "crossref", {
    "User-Agent": `CiteVerifyAI/1.0 (+https://github.com/vedanthdpattar-boop/Saptahacks${contact ? `; mailto:${contact}` : ""})`,
    Accept: "application/json",
  });
  const envelope = z.object({ message: z.unknown() }).parse(response);
  const raw = citation.doi
    ? [envelope.message]
    : z.object({ items: z.array(z.unknown()) }).parse(envelope.message).items;
  return raw.slice(0, 5).flatMap((value) => {
    const parsed = crossrefWork.safeParse(value);
    if (!parsed.success) return [];
    const work = parsed.data,
      doi = normalizeDoi(work.DOI);
    if (!doi) return [];
    const abstract = work.abstract ? plainAbstract(work.abstract) : null;
    return [
      {
        id: crypto.randomUUID(),
        provider: "crossref" as const,
        externalId: doi,
        title: work.title[0].slice(0, 2000),
        doi,
        authors: (work.author ?? [])
          .slice(0, 50)
          .map((a) => [a.given, a.family].filter(Boolean).join(" "))
          .filter(Boolean),
        year: validYear(work.issued?.["date-parts"][0]?.[0]),
        abstract,
        url: safeLink(work.URL) ?? `https://doi.org/${doi}`,
        openAccessUrl: null,
        accessStatus: abstract
          ? ("abstract_only" as const)
          : ("metadata_only" as const),
        locations: [],
        providers: ["crossref"],
      },
    ];
  });
}
export function reconstructAbstract(index?: Record<string, number[]> | null) {
  if (!index) return null;
  const positions = new Map<number, string>();
  for (const [word, indexes] of Object.entries(index))
    for (const i of indexes) positions.set(i, word);
  return (
    [...positions]
      .sort((a, b) => a[0] - b[0])
      .map(([, word]) => word)
      .join(" ")
      .slice(0, 20000) || null
  );
}
export async function searchOpenAlex(
  env: Bindings,
  citation: CitationRow,
): Promise<PublicationCandidate[]> {
  const url = new URL(
    citation.doi
      ? `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(citation.doi)}`
      : "https://api.openalex.org/works",
  );
  if (!citation.doi) {
    url.searchParams.set(
      "search",
      (citation.title ?? citation.reference_text).slice(0, 500),
    );
    url.searchParams.set("per_page", "5");
  }
  if (env.OPENALEX_API_KEY)
    url.searchParams.set("api_key", env.OPENALEX_API_KEY);
  const response = await researchJson(env, url.href, "openalex");
  const raw = citation.doi
    ? [response]
    : z.object({ results: z.array(z.unknown()) }).parse(response).results;
  return raw.slice(0, 5).flatMap((value) => {
    const parsed = openalexWork.safeParse(value);
    if (!parsed.success) return [];
    const work = parsed.data,
      title = work.title ?? work.display_name;
    if (!title || !/^https:\/\/openalex\.org\/W\d+$/.test(work.id)) return [];
    const locations = [
      ...new Set(
        (work.locations ?? [])
          .filter((l) => l.is_oa)
          .flatMap((l) => [safeLink(l.landing_page_url), safeLink(l.pdf_url)])
          .filter((l): l is string => !!l),
      ),
    ].slice(0, 10);
    const openAccessUrl = work.open_access?.is_oa
      ? (safeLink(work.open_access.oa_url) ?? locations[0] ?? null)
      : null;
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    return [
      {
        id: crypto.randomUUID(),
        provider: "openalex" as const,
        externalId: work.id,
        title: title.slice(0, 2000),
        doi: normalizeDoi(work.doi),
        authors: (work.authorships ?? [])
          .slice(0, 50)
          .map((a) => a.author.display_name ?? "")
          .filter(Boolean),
        year: validYear(work.publication_year),
        abstract,
        url:
          safeLink(work.primary_location?.landing_page_url) ??
          (work.doi ? safeLink(work.doi) : null) ??
          work.id,
        openAccessUrl,
        accessStatus: openAccessUrl
          ? ("open_access" as const)
          : abstract
            ? ("abstract_only" as const)
            : ("metadata_only" as const),
        locations,
        providers: ["openalex"],
      },
    ];
  });
}
const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "study",
  "of",
  "in",
  "on",
  "a",
  "an",
  "to",
]);
const titleWords = (value: string) =>
  new Set(normalizedWords(value).filter((w) => !stopwords.has(w)));
export function titleSimilarity(a: string, b: string) {
  const aw = titleWords(a),
    bw = titleWords(b);
  if (!aw.size || !bw.size) return 0;
  return (2 * [...aw].filter((w) => bw.has(w)).length) / (aw.size + bw.size);
}
export function publicationScore(
  citation: CitationRow,
  publication: PublicationCandidate,
) {
  const title = citation.title
    ? titleSimilarity(citation.title, publication.title)
    : (() => {
        const words = titleWords(publication.title),
          referenceWords = new Set(normalizedWords(citation.reference_text));
        return words.size >= 3
          ? [...words].filter((w) => referenceWords.has(w)).length / words.size
          : 0;
      })();
  const citedAuthors: string[] = JSON.parse(citation.authors_json);
  const referenceWords = new Set(normalizedWords(citedAuthors.join(" ")));
  const surnames = publication.authors
    .map((a) => normalizedWords(a.includes(",") ? a.split(",")[0] : a).at(-1))
    .filter((a): a is string => !!a);
  const author =
    !citedAuthors.length || !surnames.length
      ? 0.5
      : surnames.some((a) => referenceWords.has(a))
        ? 1
        : 0;
  const year =
    !citation.publication_year || !publication.year
      ? 0.5
      : Math.abs(citation.publication_year - publication.year) <= 1
        ? 1
        : 0;
  if (citation.doi) {
    if (citation.doi !== publication.doi) return 0;
    if (citation.title && title < 0.55) return 0.4;
    if (author === 0) return 0.6;
    if (year === 0) return 0.85;
    return Math.min(1, 0.9 + 0.05 * author + 0.05 * year);
  }
  return title < 0.65
    ? 0.7 * title
    : Math.min(1, 0.7 * title + 0.2 * author + 0.1 * year);
}
export function mergeCandidates(candidates: PublicationCandidate[]) {
  const result = new Map<string, PublicationCandidate>();
  for (const candidate of candidates) {
    const key =
      candidate.doi ??
      `${normalizedWords(candidate.title).join(" ")}:${candidate.year ?? ""}`;
    const previous = result.get(key);
    if (!previous) {
      result.set(key, candidate);
      continue;
    }
    if (titleSimilarity(previous.title, candidate.title) < 0.6) {
      result.set(`${key}:${candidate.externalId}`, candidate);
      continue;
    }
    const preferred = candidate.provider === "openalex" ? candidate : previous;
    result.set(key, {
      ...preferred,
      abstract: preferred.abstract ?? previous.abstract ?? candidate.abstract,
      locations: [...new Set([...previous.locations, ...candidate.locations])],
      openAccessUrl:
        preferred.openAccessUrl ??
        previous.openAccessUrl ??
        candidate.openAccessUrl,
      providers: [...new Set([...previous.providers, ...candidate.providers])],
    });
  }
  return [...result.values()];
}
export function matchPublication(
  citation: CitationRow,
  candidates: PublicationCandidate[],
) {
  const scored = mergeCandidates(candidates)
    .map((publication) => ({
      publication,
      score: publicationScore(citation, publication),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const minimum = citation.doi ? 0.9 : 0.78;
  const ambiguous =
    scored.length > 1 && scored[0].score - scored[1].score < 0.08;
  return {
    candidates: scored.slice(0, 10),
    selected:
      best && best.score >= minimum && !ambiguous ? best.publication : null,
    notes: !best
      ? ["No publication candidates were returned."]
      : best.score < minimum
        ? [
            "Publication metadata does not match the citation closely enough; the DOI, title, authors or year may be incorrect.",
          ]
        : ambiguous
          ? [
              "Multiple publications match similarly; human confirmation of the original source is required.",
            ]
          : [],
  };
}
export async function resolvePublication(env: Bindings, citation: CitationRow) {
  const repo = new Repository(env.DB);
  if (
    citation.resolved_at &&
    Date.now() - Date.parse(citation.resolved_at) < 3600000
  )
    return {
      source: await repo.cachedResolution(citation.id),
      notes: JSON.parse(citation.resolution_notes_json) as string[],
    };
  const cached = (await repo.cachedSources(citation))
    .filter((s) => Date.now() - Date.parse(s.updated_at) < 86400000)
    .map(publicationFromRow);
  const results = await Promise.allSettled([
    searchCrossref(env, citation),
    searchOpenAlex(env, citation),
  ]);
  const candidates = [...cached],
    notes: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") candidates.push(...r.value);
    else
      notes.push(
        `${i === 0 ? "Crossref" : "OpenAlex"}: ${r.reason instanceof ApiError ? r.reason.message : "The metadata response could not be validated."}`,
      );
  });
  if (!env.CROSSREF_CONTACT_EMAIL)
    notes.push(
      "CROSSREF_CONTACT_EMAIL is not configured; Crossref's polite-pool contact is unavailable.",
    );
  const match = matchPublication(citation, candidates);
  notes.push(...match.notes);
  const source = await repo.resolveCitation(
    citation,
    match.candidates,
    match.selected?.id ?? null,
    notes,
  );
  return { source, notes };
}
