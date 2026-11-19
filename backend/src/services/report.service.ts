import { Repository } from "../database/repository";
import type {
  ClaimRow,
  CitationRow,
  DocumentRow,
  EvidenceRow,
  ReportData,
  SourceRow,
  Verdict,
} from "../types";
import { documentDTO } from "./document.service";
import { titleSimilarity } from "./research.service";
export const verdictLabels: Record<Verdict, string> = {
  supported: "Supported",
  partially_supported: "Partially Supported",
  unsupported: "Unsupported",
  contradictory: "Contradictory",
  possibly_outdated: "Potentially Outdated",
  needs_review: "Needs Human Review",
};
function publicationDTO(source: SourceRow, evidenceUrl?: string) {
  return {
    title: source.title,
    authors: JSON.parse(source.authors_json) as string[],
    ...(source.publication_year ? { year: source.publication_year } : {}),
    ...(source.doi ? { doi: source.doi } : {}),
    ...((evidenceUrl ?? source.landing_page_url)
      ? { url: evidenceUrl ?? source.landing_page_url! }
      : {}),
  };
}
export function citationDTO(citation: CitationRow, data: ReportData) {
  const matches = data.matches
    .filter((m) => m.citation_id === citation.id)
    .flatMap((m) => {
      const source = data.sources.find((s) => s.id === m.source_id);
      return source
        ? [
            {
              score: m.match_score,
              selected: m.is_selected === 1,
              ...publicationDTO(source),
            },
          ]
        : [];
    });
  const publication = matches.find((m) => m.selected) ?? null;
  const differences: string[] = [];
  if (
    publication &&
    citation.title &&
    titleSimilarity(citation.title, publication.title) < 0.95
  )
    differences.push(
      "The printed title differs from the matched publication title; compare both versions.",
    );
  if (
    publication?.year &&
    citation.publication_year &&
    publication.year !== citation.publication_year
  )
    differences.push(
      `Printed year ${citation.publication_year} differs from registered year ${publication.year}. Online-first and issue dates can differ; check the publisher record.`,
    );
  return {
    id: citation.id,
    documentId: citation.document_id,
    key: citation.citation_key,
    referenceText: citation.reference_text,
    doi: citation.doi,
    title: citation.title,
    authors: JSON.parse(citation.authors_json) as string[],
    year: citation.publication_year,
    status: !citation.resolved_at
      ? "unchecked"
      : publication && !differences.length
        ? "matched"
        : "needs_review",
    checkedAt: citation.resolved_at,
    publication,
    alternatives: matches
      .filter((m) => !m.selected)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    notes: [
      ...(JSON.parse(citation.resolution_notes_json) as string[]),
      ...differences,
    ],
  };
}
function evidenceDTO(e: EvidenceRow, data: ReportData) {
  const source = data.sources.find((s) => s.id === e.source_id);
  return {
    id: e.id,
    passage: e.evidence_text,
    sourceId: e.source_id,
    citationId: e.citation_id,
    location: e.evidence_location,
    evidenceType: e.evidence_type,
    retrievalMethod: e.retrieval_method,
    sourceUrl: e.source_url,
    retrievedAt: e.created_at,
    relation: e.relation,
    publication: source ? publicationDTO(source) : null,
  };
}
export function claimDTO(claim: ClaimRow, data: ReportData) {
  const verification = data.verifications.find((v) => v.claim_id === claim.id);
  const mappings = data.mappings.filter((m) => m.claim_id === claim.id);
  const citations = mappings.flatMap((m) =>
    data.citations.filter((c) => c.id === m.citation_id),
  );
  const allEvidence = data.evidence.filter((e) => e.claim_id === claim.id);
  const ids: string[] = verification
    ? JSON.parse(verification.evidence_ids_json)
    : [];
  const quoted = ids.flatMap((id) => allEvidence.filter((e) => e.id === id));
  if (quoted.length !== ids.length)
    throw new Error("verification_evidence_relationship_invalid");
  const displayEvidence = quoted.length
    ? quoted
    : allEvidence.filter((e) => e.evidence_type === "abstract").slice(0, 1);
  const firstMatch = data.matches.find(
    (m) => m.is_selected && citations.some((c) => c.id === m.citation_id),
  );
  const primary = data.sources.find(
    (s) => s.id === (displayEvidence[0]?.source_id ?? firstMatch?.source_id),
  );
  const limitations = verification
    ? (JSON.parse(verification.limitations_json) as string[])
    : ["This claim has not been verified yet."];
  const matchedCitations = citations.map((c) => ({
    id: c.id,
    key: c.citation_key,
    referenceText: c.reference_text,
    doi: c.doi,
    title: c.title,
    authors: JSON.parse(c.authors_json) as string[],
    year: c.publication_year,
    associationMethod: mappings.find((m) => m.citation_id === c.id)!
      .match_method,
    associationConfidence: mappings.find((m) => m.citation_id === c.id)!
      .match_confidence,
    diagnostics: JSON.parse(c.resolution_notes_json) as string[],
    matches: data.matches
      .filter((m) => m.citation_id === c.id)
      .flatMap((m) => {
        const s = data.sources.find((s) => s.id === m.source_id);
        return s
          ? [
              {
                sourceId: s.id,
                score: m.match_score,
                selected: m.is_selected === 1,
                ...publicationDTO(s),
              },
            ]
          : [];
      }),
  }));
  return {
    id: claim.id,
    documentId: claim.document_id,
    text: claim.claim_text,
    citation:
      citations.map((c) => c.reference_text).join("\n\n") ||
      (JSON.parse(claim.citation_keys_json).length
        ? "Citation marker has no matched reference entry."
        : "No citation was detected for this claim."),
    verdict: verification
      ? verdictLabels[verification.verdict]
      : "Needs Human Review",
    confidence:
      verification?.confidence == null
        ? null
        : Math.round(verification.confidence * 100),
    publication: primary
      ? publicationDTO(primary, displayEvidence[0]?.source_url)
      : null,
    evidence: displayEvidence.map((e) => e.evidence_text).join("\n\n") || null,
    evidenceReference: displayEvidence.length
      ? displayEvidence
          .map(
            (e) =>
              `${e.evidence_type === "abstract" ? "Abstract only — not full-text verification" : "Full text"}: ${e.evidence_location}; ${e.retrieval_method}; retrieved ${e.created_at}; ${e.source_url}`,
          )
          .join("\n")
      : "No relevant full-text passage was retrieved.",
    explanation:
      verification?.explanation ?? "Verification has not run for this claim.",
    limitations,
    humanReview: verification?.requires_human_review
      ? "Human review is recommended. Check the original publication, numerical details, population and study limitations."
      : "A human reviewer can inspect the quoted passage and original publication; confidence is an uncalibrated evidence-strength estimate.",
    pageNumber: claim.page_number,
    claimType: claim.claim_type,
    extractionConfidence: claim.extraction_confidence,
    matchedCitations,
    retrievedEvidence: allEvidence.map((e) => evidenceDTO(e, data)),
    verification: verification
      ? {
          verdict: verification.verdict,
          confidence: verification.confidence,
          confidenceType: "uncalibrated_evidence_strength",
          explanation: verification.explanation,
          limitations,
          requiresHumanReview: verification.requires_human_review === 1,
          modelName: verification.model_name,
          createdAt: verification.created_at,
          evidence: quoted.map((e) => evidenceDTO(e, data)),
        }
      : null,
  };
}
export function buildReport(document: DocumentRow, data: ReportData) {
  const counts = Object.fromEntries(
    Object.keys(verdictLabels).map((verdict) => [
      verdict,
      data.verifications.filter((v) => v.verdict === verdict).length,
    ]),
  ) as Record<Verdict, number>;
  const matchedClaims = new Set(data.mappings.map((m) => m.claim_id)).size;
  const matchedPublications = new Set(
    data.matches.filter((m) => m.is_selected).map((m) => m.citation_id),
  ).size;
  const unverified = data.claims.length - data.verifications.length;
  return {
    document: documentDTO(document),
    claims: data.claims.map((c) => claimDTO(c, data)),
    citations: data.citations.map((c) => citationDTO(c, data)),
    generatedAt: new Date().toISOString(),
    status: data.jobs[0]?.status === "complete" ? "complete" : "processing",
    limitations: [
      "Confidence is an uncalibrated estimate of evidence strength, not a statistical probability or a universal scientific integrity score.",
      "Missing publications or full-text passages require human review and do not establish that a claim is false.",
      "The search is limited to cited publications and supported open repositories; it is not an exhaustive literature review.",
      "Uploaded text comes from client-side PDF extraction. Physical page numbers are omitted unless explicit page boundaries were supplied.",
      ...(unverified
        ? [
            `${unverified} extracted claim(s) have not yet been verified; the analysis is incomplete.`,
          ]
        : []),
      ...(data.jobs[0]?.extraction_complete
        ? []
        : ["Claim extraction has not completed."]),
      ...(JSON.parse(document.diagnostics_json).length
        ? [
            "Citation diagnostics are included in citationDiagnostics and each claim's matchedCitations.",
          ]
        : []),
    ],
    summary: {
      totalClaims: data.claims.length,
      verifiedClaims: data.verifications.length,
      unverifiedClaims: unverified,
      supportedClaims: counts.supported,
      partiallySupportedClaims: counts.partially_supported,
      unsupportedClaims: counts.unsupported,
      contradictoryClaims: counts.contradictory,
      potentiallyOutdatedClaims: counts.possibly_outdated,
      needsReviewClaims: counts.needs_review,
      claimsRequiringHumanReview:
        data.verifications.filter((v) => v.requires_human_review).length +
        unverified,
      claimCitationMappingRate: data.claims.length
        ? matchedClaims / data.claims.length
        : null,
      citationMatchingRate: data.citations.length
        ? matchedPublications / data.citations.length
        : null,
      totalCitations: data.citations.length,
      matchedPublications,
      verdictCounts: counts,
    },
    citationDiagnostics: JSON.parse(document.diagnostics_json) as string[],
  };
}
export async function generateReport(repo: Repository, document: DocumentRow) {
  return buildReport(document, await repo.reportData(document.id));
}
