import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { ApiError } from "../middleware/error.middleware";
import type {
  Bindings,
  ClaimRow,
  EvidenceRow,
  PublicationCandidate,
} from "../types";
import { normalizeDoi, normalizedWords } from "./citation.service";
import { allowedExternalUrl, fetchBounded, researchJson } from "./http.service";
import { titleSimilarity } from "./research.service";

export interface Passage {
  text: string;
  location: string;
}
const evidenceHosts = [
  "www.ebi.ac.uk",
  "europepmc.org",
  "pmc.ncbi.nlm.nih.gov",
  "arxiv.org",
  "journals.plos.org",
  "elifesciences.org",
];
export const normalizePassage = (text: string) =>
  text.replace(/\s+/g, " ").trim();
const decodeEntities = (text: string) =>
  text
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
      const code = n.startsWith("x") ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
type OrderedNode = Record<string, unknown>;
function element(nodes: OrderedNode[], name: string) {
  return nodes.flatMap((n) =>
    Array.isArray(n[name]) ? [n[name] as OrderedNode[]] : [],
  );
}
function allElements(nodes: OrderedNode[], name: string): OrderedNode[][] {
  return nodes.flatMap((n) =>
    Object.entries(n).flatMap(([key, value]) =>
      key === ":@" || !Array.isArray(value)
        ? []
        : [
            ...(key === name ? [value as OrderedNode[]] : []),
            ...allElements(value as OrderedNode[], name),
          ],
    ),
  );
}
function nodeText(nodes: OrderedNode[]): string {
  return nodes
    .map((n) =>
      Object.entries(n)
        .map(([key, value]) =>
          key === "#text"
            ? String(value)
            : key === ":@"
              ? ""
              : Array.isArray(value)
                ? nodeText(value as OrderedNode[])
                : "",
        )
        .join(""),
    )
    .join("");
}
function checkedIdentity(
  publication: PublicationCandidate,
  doi: string | null,
  title: string,
  authors: string[] = [],
) {
  if (publication.doi)
    return (
      doi === publication.doi &&
      (!title || titleSimilarity(title, publication.title) >= 0.55)
    );
  const expectedAuthors = new Set(
    normalizedWords(publication.authors.join(" ")),
  );
  return (
    titleSimilarity(title, publication.title) >= 0.85 &&
    authors.some((a) => normalizedWords(a).some((w) => expectedAuthors.has(w)))
  );
}
function paragraphParts(text: string, location: string): Passage[] {
  const clean = normalizePassage(text);
  if (clean.length < 25) return [];
  if (clean.length <= 3000) return [{ text: clean, location }];
  const parts: Passage[] = [];
  for (let start = 0; start < clean.length; start += 2700)
    parts.push({
      text: clean.slice(start, start + 3000),
      location: `${location}, characters ${start + 1}–${Math.min(start + 3000, clean.length)}`,
    });
  return parts;
}
export function parseJats(
  xml: string,
  publication: PublicationCandidate,
): Passage[] {
  if (/<!ENTITY\b/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new ApiError(
      502,
      "invalid_source_xml",
      "The source XML contains unsupported entities or invalid markup.",
    );
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    processEntities: false,
    parseTagValue: false,
    trimValues: false,
  });
  const root = parser.parse(xml) as OrderedNode[];
  const article = element(root, "article")[0];
  if (!article) return [];
  const front = element(article, "front")[0] ?? [];
  const meta = element(front, "article-meta")[0] ?? [];
  const doiNode = meta.find(
    (n) =>
      n["article-id"] &&
      (n[":@"] as Record<string, string> | undefined)?.["@pub-id-type"] ===
        "doi",
  );
  const doi = doiNode
    ? normalizeDoi(
        decodeEntities(nodeText(doiNode["article-id"] as OrderedNode[])).trim(),
      )
    : null;
  const title = decodeEntities(
    nodeText(allElements(meta, "article-title")[0] ?? []),
  );
  const authors = allElements(meta, "surname").map((n) =>
    decodeEntities(nodeText(n)),
  );
  if (!checkedIdentity(publication, doi, title, authors))
    throw new ApiError(
      502,
      "source_identity_mismatch",
      "The full-text document does not match the selected publication's DOI or title.",
    );
  const body = element(article, "body")[0] ?? [];
  const passages: Passage[] = [];
  let paragraph = 0;
  function walk(nodes: OrderedNode[], section: string) {
    for (const node of nodes)
      for (const [tag, contents] of Object.entries(node)) {
        if (!Array.isArray(contents) || tag === ":@") continue;
        if (tag === "sec") {
          const title = normalizePassage(
            decodeEntities(
              nodeText(element(contents as OrderedNode[], "title")[0] ?? []),
            ),
          );
          if (/abstract|references|bibliography|acknowledg/i.test(title))
            continue;
          const location = title
            ? `${section === "Body" ? "" : section + " / "}${title}`.slice(
                0,
                220,
              )
            : section;
          walk(contents as OrderedNode[], location);
        } else if (tag === "p") {
          paragraph++;
          passages.push(
            ...paragraphParts(
              decodeEntities(nodeText(contents as OrderedNode[])),
              `${section}, paragraph ${paragraph}`,
            ),
          );
        } else if (
          ![
            "title",
            "abstract",
            "table-wrap",
            "fig",
            "ref-list",
            "supplementary-material",
          ].includes(tag)
        )
          walk(contents as OrderedNode[], section);
      }
  }
  walk(body, "Body");
  return passages.slice(0, 2000);
}
export async function parseResearchHtml(
  html: string,
  publication: PublicationCandidate,
  sourceUrl: string,
): Promise<Passage[]> {
  const passages: Passage[] = [];
  let doi: string | null = null,
    title = "",
    arxivId = "",
    section = "Body",
    excluded = 0;
  let current:
    { text: string; location: string; excluded: boolean } | undefined;
  let heading: { text: string } | undefined;
  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(e) {
        const name = (
          e.getAttribute("name") ??
          e.getAttribute("property") ??
          ""
        ).toLowerCase();
        const content = e.getAttribute("content") ?? "";
        if (
          ["citation_doi", "dc.identifier", "dc.identifier.doi"].includes(name)
        )
          doi = normalizeDoi(content) ?? doi;
        if (name === "citation_title") title = content;
        if (name === "citation_arxiv_id")
          arxivId = content.replace(/^arxiv:/i, "");
      },
    })
    .on(
      ".abstract, #abstract, .references, #references, .ref-list, script, style, nav",
      {
        element(e) {
          excluded++;
          e.onEndTag(() => {
            excluded--;
          });
        },
      },
    )
    .on("h2, h3, .ltx_title_section, .ltx_title_subsection", {
      element(e) {
        const record = { text: "" };
        heading = record;
        e.onEndTag(() => {
          if (record.text.trim())
            section = normalizePassage(record.text).slice(0, 220);
          heading = undefined;
        });
      },
      text(t) {
        if (heading) heading.text += t.text;
      },
    })
    .on(
      ".ltx_p, #artText p, .article-body p, .main-article-body p, .article-section__body p, .body-content p, #main-content .sec p",
      {
        element(e) {
          const record = {
            text: "",
            location: `${section}, paragraph ${passages.length + 1}`,
            excluded:
              excluded > 0 ||
              /abstract|references|bibliography|acknowledg/i.test(section),
          };
          current = record;
          e.onEndTag(() => {
            if (!record.excluded)
              passages.push(...paragraphParts(record.text, record.location));
            current = undefined;
          });
        },
        text(t) {
          if (current) current.text += t.text;
        },
      },
    );
  await rewriter
    .transform(new Response(html, { headers: { "Content-Type": "text/html" } }))
    .text();
  const sourceArxiv = publication.doi?.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1];
  const pathId = new URL(sourceUrl).pathname.match(
    /^\/html\/(.+?)(?:v\d+)?\/?$/,
  )?.[1];
  if (
    sourceArxiv &&
    arxivId &&
    pathId &&
    arxivId.replace(/v\d+$/, "").toLowerCase() ===
      sourceArxiv.replace(/v\d+$/, "").toLowerCase() &&
    titleSimilarity(title, publication.title) >= 0.85
  )
    return passages.slice(0, 2000);
  if (!checkedIdentity(publication, doi, title))
    throw new ApiError(
      502,
      "source_identity_mismatch",
      "The HTML full text has no matching publication identifier.",
    );
  return passages.slice(0, 2000);
}
export function parseResearchText(
  text: string,
  publication: PublicationCandidate,
): Passage[] {
  const header = text.slice(0, 1000);
  const doi = normalizeDoi(header.match(/(?:^|\n)DOI:\s*(\S+)/i)?.[1]);
  if (
    !publication.doi ||
    doi !== publication.doi ||
    !normalizedWords(publication.title).every((word) =>
      new Set(normalizedWords(header)).has(word),
    ) ||
    /abstract[- ]only/i.test(header)
  )
    return [];
  const sections = [
    ...text.matchAll(
      /(?:^|\n)\s*(Abstract|Introduction|Methods|Materials and Methods|Results|Discussion|Conclusions?|References)\s*:?\s*\n/gi,
    ),
  ];
  const passages: Passage[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (/abstract|references/i.test(section[1])) continue;
    const body = text.slice(
      section.index + section[0].length,
      sections[i + 1]?.index ?? text.length,
    );
    passages.push(
      ...body
        .split(/\n\s*\n/)
        .flatMap((p, n) =>
          paragraphParts(p, `${section[1]}, text paragraph ${n + 1}`),
        ),
    );
  }
  return passages.slice(0, 2000);
}
export function selectRelevantPassages(
  claim: string,
  passages: Passage[],
): Passage[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "was",
    "were",
    "study",
    "research",
    "a",
    "an",
    "of",
    "in",
    "to",
    "by",
  ]);
  const stem = (word: string) =>
    word.length > 4
      ? word.replace(/(ments?|ing|ed|s)$/, "").replace(/e$/, "")
      : word;
  const words = new Set(
    normalizedWords(claim)
      .filter((w) => !stop.has(w) && w.length > 1)
      .map(stem),
  );
  const ranked = passages
    .map((p, i) => ({
      p,
      i,
      score: [...new Set(normalizedWords(p.text).map(stem))].filter((w) =>
        words.has(w),
      ).length,
    }))
    .filter((p) => p.score >= 2)
    .sort((a, b) => b.score - a.score);
  const indexes = new Set<number>();
  for (const match of ranked.slice(0, 3))
    for (const i of [match.i, match.i - 1, match.i + 1])
      if (i >= 0 && i < passages.length && indexes.size < 8) indexes.add(i);
  const chosen = [...indexes].sort((a, b) => a - b).map((i) => passages[i]);
  let characters = 0;
  return chosen.filter((p) => {
    characters += p.text.length;
    return characters <= 18000;
  });
}
async function fetchEvidence(env: Bindings, url: string) {
  if (
    !env.RESEARCH_RATE_LIMITER ||
    !(await env.RESEARCH_RATE_LIMITER.limit({ key: "evidence" })).success
  )
    throw new ApiError(
      502,
      "research_rate_limited",
      "The shared evidence retrieval rate limit was reached.",
    );
  return fetchBounded(url, {}, evidenceHosts, 8000, 2000000);
}
const europePmcResult = z.object({
  resultList: z.object({
    result: z.array(
      z.object({
        pmcid: z.string().optional(),
        doi: z.string().optional(),
        isOpenAccess: z.string().optional(),
      }),
    ),
  }),
});
export async function retrieveEvidence(
  env: Bindings,
  claim: ClaimRow,
  publication: PublicationCandidate,
  citationId: string,
) {
  const limitations: string[] = [
    "Evidence retrieval is bounded; figures, tables and supplementary files are not analysed.",
  ];
  let passages: Passage[] = [],
    sourceUrl = "",
    method = "";
  const locations = [
    ...new Set(
      [publication.openAccessUrl, ...publication.locations].filter(
        (url): url is string => !!url,
      ),
    ),
  ];
  const knownPmc = locations
    .map((url) => url.match(/\/articles\/(PMC\d+)\b/i)?.[1])
    .find(Boolean);
  try {
    let pmcid = knownPmc;
    if (!pmcid && publication.doi) {
      const url = new URL(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
      );
      url.searchParams.set(
        "query",
        `DOI:"${publication.doi}" AND OPEN_ACCESS:Y`,
      );
      url.searchParams.set("format", "json");
      url.searchParams.set("pageSize", "3");
      const result = europePmcResult.parse(
        await researchJson(env, url.href, "europepmc"),
      );
      pmcid = result.resultList.result.find(
        (r) =>
          normalizeDoi(r.doi) === publication.doi &&
          r.isOpenAccess?.toUpperCase() === "Y" &&
          /^PMC\d+$/.test(r.pmcid ?? ""),
      )?.pmcid;
    }
    if (pmcid) {
      const result = await fetchEvidence(
        env,
        `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`,
      );
      passages = parseJats(result.text, publication);
      sourceUrl = result.url;
      method = "europepmc_jats_xml";
    }
  } catch (error) {
    limitations.push(
      `Europe PMC: ${error instanceof ApiError ? error.message : "The source response could not be validated."}`,
    );
  }
  if (!passages.length) {
    const supported: string[] = [];
    for (const value of locations) {
      try {
        const url = allowedExternalUrl(value, evidenceHosts);
        if (url.hostname === "arxiv.org" && /^\/pdf\//.test(url.pathname))
          url.pathname = url.pathname
            .replace(/^\/pdf\//, "/html/")
            .replace(/\.pdf$/, "");
        if (
          url.hostname === "journals.plos.org" &&
          /\/article$/.test(url.pathname) &&
          url.searchParams.get("id")
        ) {
          url.pathname += "/file";
          url.searchParams.set("type", "manuscript");
        }
        if (/\.pdf$/i.test(url.pathname)) {
          limitations.push(
            "A linked open-access PDF requires a parser outside the Worker and was not used as full-text evidence.",
          );
          continue;
        }
        if (!supported.includes(url.href)) supported.push(url.href);
      } catch {
        limitations.push(
          "An open-access location is outside the supported repository allowlist and was not fetched.",
        );
      }
    }
    for (const url of supported.slice(0, 2)) {
      try {
        const result = await fetchEvidence(env, url);
        if (
          /xml/i.test(result.contentType) ||
          /^\s*(?:<\?xml[^>]+>\s*)?<article\b/.test(result.text)
        ) {
          passages = parseJats(result.text, publication);
          method = "repository_jats_xml";
        } else if (/html/i.test(result.contentType)) {
          passages = await parseResearchHtml(
            result.text,
            publication,
            result.url,
          );
          method = "repository_html";
        } else if (/^text\/plain/i.test(result.contentType)) {
          passages = parseResearchText(result.text, publication);
          method = "repository_text";
        } else
          limitations.push(
            "The repository response was not parsable HTML, XML or text.",
          );
        if (passages.length) {
          sourceUrl = result.url;
          break;
        }
      } catch (error) {
        limitations.push(
          `Open repository: ${error instanceof ApiError ? error.message : "The full text could not be parsed."}`,
        );
      }
    }
  }
  const selected = selectRelevantPassages(claim.claim_text, passages);
  const now = new Date().toISOString();
  const evidence: EvidenceRow[] = selected.map((p) => ({
    id: crypto.randomUUID(),
    claim_id: claim.id,
    citation_id: citationId,
    source_id: publication.id,
    evidence_text: p.text,
    evidence_location: p.location,
    evidence_type: "full_text",
    retrieval_method: method,
    source_url: sourceUrl,
    relation: "context",
    created_at: now,
  }));
  if (!selected.length) {
    limitations.push(
      passages.length
        ? "The bounded full-text search found no sufficiently relevant passage; this does not establish that the claim is false."
        : "Original full-text evidence could not be retrieved from a supported open repository.",
    );
    if (publication.abstract)
      evidence.push({
        id: crypto.randomUUID(),
        claim_id: claim.id,
        citation_id: citationId,
        source_id: publication.id,
        evidence_text: publication.abstract.slice(0, 3000),
        evidence_location: "Abstract only",
        evidence_type: "abstract",
        retrieval_method: `${publication.provider}_abstract`,
        source_url:
          publication.url ??
          (publication.doi
            ? `https://doi.org/${publication.doi}`
            : publication.externalId),
        relation: "context",
        created_at: now,
      });
  }
  return { evidence, limitations: [...new Set(limitations)] };
}
