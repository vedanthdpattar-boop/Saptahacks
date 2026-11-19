import type { CitationRow, ClaimCitationRow, ClaimRow } from "../types";
export const normalizedWords = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
export function normalizeDoi(value: string | null | undefined) {
  if (!value) return null;
  const match = value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .match(/^10\.\d{4,9}\/[^\s<>"{}]+/i);
  if (!match) return null;
  let doi = match[0].replace(/[.,;:]+$/, "");
  while (
    doi.endsWith(")") &&
    (doi.match(/\)/g)?.length ?? 0) > (doi.match(/\(/g)?.length ?? 0)
  )
    doi = doi.slice(0, -1);
  return doi.toLowerCase();
}
export function canonicalCitationKey(value: string) {
  const numeric = value.trim().match(/^\[?(\d{1,3})\]?[.)]?$/);
  if (numeric) return `[${Number(numeric[1])}]`;
  const author = value.match(
    /([\p{L}'’-]+)(?:\s+et\s+al\.)?\s*[,:( ]+\s*(\d{4}[a-z]?)/iu,
  );
  return author
    ? `${normalizedWords(author[1]).join("")}:${author[2].toLowerCase()}`
    : null;
}
export function citationMarkers(
  text: string,
): { key: string; start: number; end: number }[] {
  const found: { key: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
    const keys = new Set<number>();
    for (const part of m[1].split(",")) {
      const range = part.trim().split(/[–-]/).map(Number);
      if (range.length === 1) keys.add(range[0]);
      else if (range[1] >= range[0] && range[1] - range[0] <= 20)
        for (let n = range[0]; n <= range[1]; n++) keys.add(n);
    }
    for (const n of keys)
      found.push({ key: `[${n}]`, start: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(
    /\(([^()]{1,140}\b\d{4}[a-z]?[^()]{0,60})\)/g,
  )) {
    for (const part of m[1].split(";")) {
      const key = canonicalCitationKey(part.trim());
      if (key) found.push({ key, start: m.index, end: m.index + m[0].length });
    }
  }
  for (const m of text.matchAll(
    /\b([\p{Lu}][\p{L}'’-]+)(?:\s+et\s+al\.)?\s*\((\d{4}[a-z]?)\)/gu,
  ))
    found.push({
      key: `${normalizedWords(m[1]).join("")}:${m[2].toLowerCase()}`,
      start: m.index,
      end: m.index + m[0].length,
    });
  return found;
}
export function parseReference(
  documentId: string,
  key: string,
  referenceText: string,
): CitationRow {
  const text = referenceText.replace(/^\s*(?:\[\d+\]|\d+[.)])\s*/, "").trim();
  const yearMatch = text.match(/\b((?:1[5-9]|20)\d{2})[a-z]?\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const doiMatch = text.match(
    /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[^\s<>"{}]+)/i,
  );
  const doi = normalizeDoi(doiMatch?.[1]);
  const quoted = text.match(/["“]([^"”]{8,})["”]/)?.[1];
  const afterYear = text.match(
    /\(\d{4}[a-z]?\)\s*[.,]?\s*([^\n]+?)(?:\.\s+|\.$|$)/,
  )?.[1];
  const title = (quoted ?? afterYear)?.trim() ?? null;
  const authorPrefix = yearMatch
    ? text.slice(0, yearMatch.index).replace(/[\s(.,;]+$/, "")
    : "";
  const authors =
    authorPrefix && authorPrefix.length <= 300 ? [authorPrefix] : [];
  return {
    id: crypto.randomUUID(),
    document_id: documentId,
    citation_key: canonicalCitationKey(key) ?? key,
    reference_text: referenceText.trim(),
    doi,
    title,
    authors_json: JSON.stringify(authors),
    publication_year: year,
    resolution_notes_json: "[]",
    resolved_at: null,
    created_at: new Date().toISOString(),
  };
}
export function parseReferences(documentId: string, text: string) {
  const heading =
    [
      ...text.matchAll(
        /(?:^|\n)\s*(?:references|bibliography|literature cited)\b[:\s]*/gi,
      ),
    ].at(-1) ?? [...text.matchAll(/\bReferences\s*(?=\[1\]|1[.)]\s)/g)].at(-1);
  if (!heading)
    return {
      citations: [] as CitationRow[],
      diagnostics: [
        "No deterministic reference-list heading was found; AI reference extraction is used where possible.",
      ],
    };
  const body = text.slice(heading.index + heading[0].length);
  let starts = [
    ...body.matchAll(
      /(?:^|\s)(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s+(?=[\p{Lu}])/gu,
    ),
  ].map((m) => ({
    index: m.index,
    key: `[${Number(m[1] ?? m[2])}]`,
    skip: m[0].search(/\S/),
  }));
  if (!starts.length)
    starts = [
      ...body.matchAll(
        /(?:^|\n)\s*([\p{Lu}][\p{L}'’-]+),[^\n]{0,180}?\b(\d{4}[a-z]?)\b/gu,
      ),
    ].map((m) => ({
      index: m.index,
      key: `${normalizedWords(m[1]).join("")}:${m[2].toLowerCase()}`,
      skip: m[0].search(/\S/),
    }));
  const citations: CitationRow[] = [],
    diagnostics: string[] = [];
  const keys = new Set<string>(),
    doiKeys = new Map<string, string>();
  starts.forEach((start, i) => {
    const reference = body
      .slice(start.index + start.skip, starts[i + 1]?.index ?? body.length)
      .trim();
    if (reference.length > 4000) {
      diagnostics.push(
        `Reference ${start.key} exceeds the supported reference length and needs manual checking.`,
      );
      return;
    }
    if (keys.has(start.key)) {
      diagnostics.push(
        `Duplicate reference key ${start.key}; the first printed reference is retained.`,
      );
      return;
    }
    const citation = parseReference(documentId, start.key, reference);
    if (citation.doi && doiKeys.has(citation.doi))
      diagnostics.push(
        `Duplicate publication references ${doiKeys.get(citation.doi)} and ${start.key}.`,
      );
    if (citation.doi) doiKeys.set(citation.doi, start.key);
    if (!citation.publication_year)
      diagnostics.push(
        `Reference ${start.key} has no parseable publication year.`,
      );
    if (!citation.doi && /\bdoi\s*:/i.test(reference))
      diagnostics.push(`Reference ${start.key} has a malformed DOI.`);
    keys.add(start.key);
    citations.push(citation);
  });
  if (!citations.length)
    diagnostics.push("No reference entries could be parsed deterministically.");
  return {
    citations: citations.slice(0, 150),
    diagnostics:
      citations.length > 150
        ? [
            ...diagnostics,
            "Reference list exceeds the 150-reference MVP limit.",
          ]
        : diagnostics,
  };
}
export function claimCitationKeys(
  documentText: string,
  claimText: string,
  aiKeys: string[] = [],
) {
  const mappings = new Map<
    string,
    { method: ClaimCitationRow["match_method"]; confidence: number }
  >();
  for (const m of citationMarkers(claimText))
    mappings.set(m.key, { method: "inline", confidence: 1 });
  let position = documentText.indexOf(claimText);
  if (position >= 0) {
    const after = documentText.slice(
      position + claimText.length,
      position + claimText.length + 180,
    );
    for (const m of citationMarkers(after))
      if (/^[\s.,;:]*$/.test(after.slice(0, m.start)))
        mappings.set(m.key, { method: "adjacent", confidence: 0.75 });
    const nearby = documentText.slice(
      Math.max(0, position - 100),
      position + claimText.length + 180,
    );
    const actualKeys = new Set(citationMarkers(nearby).map((m) => m.key));
    for (const raw of aiKeys) {
      const key = canonicalCitationKey(raw);
      if (key && actualKeys.has(key) && !mappings.has(key))
        mappings.set(key, { method: "ai_assisted", confidence: 0.65 });
    }
  }
  return mappings;
}
export function mapClaimsToCitations(
  text: string,
  claims: ClaimRow[],
  citations: CitationRow[],
) {
  const byKey = new Map(citations.map((c) => [c.citation_key, c]));
  const mappings: ClaimCitationRow[] = [],
    diagnostics: string[] = [];
  for (const claim of claims) {
    const keys = claimCitationKeys(
      text,
      claim.claim_text,
      JSON.parse(claim.citation_keys_json),
    );
    if (!keys.size)
      diagnostics.push(`Claim ${claim.id} has no detected citation marker.`);
    for (const [key, match] of keys) {
      const citation = byKey.get(key);
      if (!citation) {
        diagnostics.push(
          `Claim ${claim.id} references ${key}, which has no matched bibliography entry.`,
        );
        continue;
      }
      mappings.push({
        claim_id: claim.id,
        citation_id: citation.id,
        document_id: claim.document_id,
        match_method: match.method,
        match_confidence: match.confidence,
      });
    }
  }
  const used = new Set(mappings.map((m) => m.citation_id));
  for (const citation of citations)
    if (!used.has(citation.id))
      diagnostics.push(
        `Reference ${citation.citation_key} is not mapped to an extracted claim.`,
      );
  return { mappings, diagnostics };
}
