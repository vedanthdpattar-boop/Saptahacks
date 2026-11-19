import {
  aiProvider,
  structuredOutput,
  type AiProvider,
} from "../ai/ai.provider";
import { verificationPrompt } from "../ai/verification.prompt";
import { publicationFromRow, Repository } from "../database/repository";
import { ApiError } from "../middleware/error.middleware";
import {
  verificationSchema,
  type VerificationOutput,
} from "../schemas/verification.schema";
import type {
  Bindings,
  CitationRow,
  ClaimRow,
  DocumentRow,
  EvidenceRow,
  EvidenceRelation,
  PublicationCandidate,
  VerificationRow,
  Verdict,
} from "../types";
import { citationMarkers } from "./citation.service";
import { retrieveEvidence } from "./evidence.service";
import { claimDTO, generateReport } from "./report.service";
import { resolvePublication } from "./research.service";

export function numericTokens(text: string) {
  let clean = text;
  const markers = [
    ...new Map(
      citationMarkers(text).map((m) => [`${m.start}:${m.end}`, m]),
    ).values(),
  ];
  for (const marker of markers.sort((a, b) => b.start - a.start))
    clean = clean.slice(0, marker.start) + " " + clean.slice(marker.end);
  return [
    ...new Set(
      (clean.match(/\b\d+(?:[.,]\d+)?(?:\s*%)?/g) ?? []).map((n) =>
        n.replace(/\s+/g, "").replace(/,/g, "."),
      ),
    ),
  ];
}
function verifyQuotations(value: VerificationOutput, evidence: EvidenceRow[]) {
  for (const quote of value.evidence) {
    if (
      !evidence.some(
        (e) =>
          e.evidence_type === "full_text" &&
          e.source_id === quote.sourceId &&
          e.evidence_location === quote.location &&
          e.evidence_text.includes(quote.passage),
      )
    )
      throw new Error("untraceable_evidence");
  }
  if (value.verdict !== "needs_review" && !value.evidence.length)
    throw new Error("verdict_without_evidence");
  const required: Record<Verdict, EvidenceRelation[]> = {
    supported: ["supports"],
    partially_supported: ["partially_supports", "supports"],
    unsupported: ["does_not_support"],
    contradictory: ["contradicts"],
    possibly_outdated: ["contradicts", "context"],
    needs_review: [],
  };
  if (
    value.verdict !== "needs_review" &&
    !value.evidence.some((e) => required[value.verdict].includes(e.relation))
  )
    throw new Error("verdict_relation_mismatch");
}
export async function verifyClaim(
  claim: ClaimRow,
  citations: CitationRow[],
  publications: PublicationCandidate[],
  evidence: EvidenceRow[],
  provider: AiProvider | null,
  limitations: string[] = [],
) {
  const fullText = evidence.filter((e) => e.evidence_type === "full_text");
  let value: VerificationOutput;
  let model = "rules:no_full_text";
  if (!fullText.length) {
    value = {
      verdict: "needs_review",
      confidence: 0,
      explanation: !publications.length
        ? "No original publication could be matched confidently to this claim's citation. Human source identification is required; this does not show the claim is false."
        : evidence.some((e) => e.evidence_type === "abstract")
          ? "Only abstract or publication metadata is available. It cannot establish the detailed claim or numerical result, so full-text review is required."
          : "No relevant original full-text passage could be retrieved. The claim requires human review; missing evidence is not a finding that the claim is false.",
      evidence: [],
      limitations: [
        "No relevant full-text evidence was available for an evidence-based verdict.",
      ],
      requiresHumanReview: true,
    };
  } else {
    if (!provider)
      throw new ApiError(
        503,
        "ai_unavailable",
        "Configure an AI provider for full-text comparison.",
      );
    value = await structuredOutput(
      provider,
      verificationPrompt,
      {
        claim: claim.claim_text,
        citations: citations.map((c) => ({
          key: c.citation_key,
          referenceText: c.reference_text,
          doi: c.doi,
        })),
        publications: publications.map((p) => ({
          sourceId: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          doi: p.doi,
          url: p.url,
        })),
        passages: evidence.map((e) => ({
          passage: e.evidence_text,
          sourceId: e.source_id,
          location: e.evidence_location,
          evidenceType: e.evidence_type,
        })),
        limitations,
        currentYear: new Date().getUTCFullYear(),
      },
      verificationSchema,
      (v) => verifyQuotations(v, evidence),
    );
    model = provider.model;
    const quotedText = value.evidence.map((e) => e.passage).join(" ");
    const quotedNumbers = new Set(numericTokens(quotedText));
    const missingNumbers = numericTokens(claim.claim_text).filter(
      (n) => !quotedNumbers.has(n),
    );
    if (value.verdict === "supported" && missingNumbers.length) {
      value = {
        ...value,
        verdict: "partially_supported",
        requiresHumanReview: true,
        explanation:
          "The retrieved passage supports part of the claim, but does not establish every exact numerical figure. Human review of the numerical result is required.",
        limitations: [
          ...value.limitations,
          "One or more exact numerical figures are absent from the retrieved quotations.",
        ],
      };
    }
    if (
      ["supported", "unsupported", "contradictory"].includes(value.verdict) &&
      numericTokens(claim.claim_text).length &&
      /not (?:reported|established|measured)|no .{0,40}(?:reported|established)|no evidence|not assessed|was not measured/i.test(
        quotedText,
      )
    ) {
      value = {
        ...value,
        verdict:
          value.verdict === "supported"
            ? "partially_supported"
            : "needs_review",
        requiresHumanReview: true,
        explanation:
          "The retrieved passage indicates missing or unreported measurements. It cannot establish the exact numerical result or, by itself, prove the numerical claim false.",
        limitations: [
          ...value.limitations,
          "An unreported numerical measurement needs review rather than a negative factual verdict.",
        ],
      };
    }
    if (value.verdict === "possibly_outdated") {
      const quotedSources = new Set(value.evidence.map((e) => e.sourceId));
      const years = publications
        .filter((p) => quotedSources.has(p.id) && p.year)
        .map((p) => p.year!);
      if (new Set(years).size < 2)
        value = {
          ...value,
          verdict: "needs_review",
          requiresHumanReview: true,
          explanation:
            "No dated newer full-text comparator was retrieved. Publication age alone cannot establish that the claim is outdated.",
          limitations: [
            ...value.limitations,
            "Assessing outdatedness requires substantive later research.",
          ],
        };
    }
  }
  const quoteRows: EvidenceRow[] = [];
  const used = new Set<string>();
  for (const quote of value.evidence) {
    const original = fullText.find(
      (e) =>
        e.source_id === quote.sourceId &&
        e.evidence_location === quote.location &&
        e.evidence_text.includes(quote.passage),
    )!;
    const key = `${original.id}:${quote.passage}`;
    if (!used.has(key)) {
      used.add(key);
      quoteRows.push({
        ...original,
        id: crypto.randomUUID(),
        evidence_text: quote.passage,
        relation: quote.relation,
      });
    }
  }
  const confidence =
    value.verdict === "needs_review" ? null : Math.min(value.confidence, 0.95);
  const verification: VerificationRow = {
    id: crypto.randomUUID(),
    claim_id: claim.id,
    verdict: value.verdict,
    confidence,
    explanation: value.explanation,
    limitations_json: JSON.stringify([
      ...new Set([
        ...limitations,
        ...value.limitations,
        "Confidence is not statistically calibrated.",
      ]),
    ]),
    evidence_ids_json: JSON.stringify(quoteRows.map((e) => e.id)),
    requires_human_review:
      value.requiresHumanReview ||
      value.verdict !== "supported" ||
      confidence == null ||
      confidence < 0.75
        ? 1
        : 0,
    model_name: model,
    created_at: new Date().toISOString(),
  };
  return { verification, evidence: [...evidence, ...quoteRows] };
}
export async function processVerification(
  env: Bindings,
  document: DocumentRow,
  claimId: string,
) {
  const repo = new Repository(env.DB);
  const job = await repo.job(document.id);
  if (!job?.extraction_complete)
    throw new ApiError(
      409,
      "extraction_incomplete",
      "Complete document extraction before verifying claims.",
    );
  const token = await repo.acquireLease(document.id);
  try {
    const data = await repo.reportData(document.id);
    const claim = data.claims.find((c) => c.id === claimId);
    if (!claim)
      throw new ApiError(
        404,
        "claim_not_found",
        "Claim not found in this document.",
      );
    if (!data.verifications.some((v) => v.claim_id === claimId)) {
      await repo.stage(document.id, "verification");
      const mappings = data.mappings
        .filter((m) => m.claim_id === claimId)
        .sort((a, b) => b.match_confidence - a.match_confidence);
      const citations = mappings
        .slice(0, 2)
        .flatMap((m) => data.citations.filter((c) => c.id === m.citation_id));
      const limitations: string[] = [];
      if (!mappings.length)
        limitations.push(
          "No matched citation or bibliography entry was found for this claim.",
        );
      if (mappings.length > 2)
        limitations.push(
          "Only two cited publications per claim are processed in this bounded MVP; remaining references require review.",
        );
      if (mappings.some((m) => m.match_method !== "inline"))
        limitations.push(
          "Some citation associations were inferred from adjacent text or AI; association does not establish evidential support.",
        );
      const resolved: {
        citation: CitationRow;
        publication: PublicationCandidate;
      }[] = [];
      for (const citation of citations) {
        const result = await resolvePublication(env, citation);
        limitations.push(...result.notes);
        if (result.source)
          resolved.push({
            citation,
            publication: publicationFromRow(result.source),
          });
      }
      const retrieved = await Promise.all(
        resolved.map((r) =>
          retrieveEvidence(env, claim, r.publication, r.citation.id),
        ),
      );
      for (const result of retrieved) limitations.push(...result.limitations);
      const evidence = retrieved.flatMap((r) => r.evidence);
      const result = await verifyClaim(
        claim,
        citations,
        resolved.map((r) => r.publication),
        evidence,
        evidence.some((e) => e.evidence_type === "full_text")
          ? aiProvider(env)
          : null,
        limitations,
      );
      if (
        resolved.length < citations.length ||
        mappings.length > 2 ||
        mappings.some((m) => m.match_method === "ai_assisted")
      )
        result.verification.requires_human_review = 1;
      await repo.saveVerification(
        document.id,
        result.verification,
        result.evidence,
        token,
      );
    }
    // Generate the traceable report before marking the last verification complete.
    await repo.stage(document.id, "report");
    const report = await generateReport(
      repo,
      (await repo.document(document.id))!,
    );
    await repo.assertLease(document.id, token);
    await repo.updateVerificationProgress(document.id);
    return report.claims.find((c) => c.id === claimId)!;
  } catch (error) {
    await repo
      .failJob(
        document.id,
        error instanceof ApiError
          ? error.message
          : "Verification or storage failed. Retry this claim to resume.",
        token,
      )
      .catch(() => {});
    throw error;
  } finally {
    await repo.releaseLease(document.id, token).catch(() => {});
  }
}
