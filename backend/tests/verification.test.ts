import { describe, expect, it, vi } from "vitest";
import {
  numericTokens,
  verifyClaim,
} from "../src/services/verification.service";
import type { ClaimRow, EvidenceRow } from "../src/types";
import type { AiProvider } from "../src/ai/ai.provider";
import {
  syntheticClaimText,
  syntheticPassage,
  syntheticPublication,
} from "./fixtures";
const claim: ClaimRow = {
  id: "synthetic-claim",
  document_id: "synthetic-document",
  claim_text: syntheticClaimText,
  page_number: null,
  claim_type: "statistical",
  extraction_confidence: 0.8,
  citation_keys_json: "[]",
  created_at: new Date().toISOString(),
};
const evidence: EvidenceRow = {
  id: "synthetic-evidence",
  claim_id: claim.id,
  citation_id: "synthetic-citation",
  source_id: "synthetic-source",
  evidence_text: syntheticPassage,
  evidence_location: "Results, paragraph 1",
  evidence_type: "full_text",
  retrieval_method: "synthetic-test-data",
  source_url:
    "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC999999999/fullTextXML",
  relation: "context",
  created_at: new Date().toISOString(),
};
function provider(
  verdict: string,
  passage = syntheticPassage,
  relation = "partially_supports",
): AiProvider {
  return {
    model: "synthetic-test-model",
    generate: vi
      .fn()
      .mockResolvedValue({
        verdict,
        confidence: 0.87,
        explanation:
          "Synthetic fixture reports improvement, but the exact numerical increase is not established.",
        evidence: [
          {
            passage,
            sourceId: "synthetic-source",
            location: evidence.evidence_location,
            relation,
          },
        ],
        limitations: ["Synthetic fixture; no real research result."],
        requiresHumanReview: true,
      }),
  };
}
describe("grounded verdicts and missing evidence", () => {
  it("classifies the requested synthetic 30% scenario as partial support", async () => {
    const result = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [evidence],
      provider("partially_supported"),
    );
    expect(result.verification.verdict).toBe("partially_supported");
    expect(result.verification.confidence).toBe(0.87);
    expect(result.evidence.at(-1)?.evidence_text).toBe(syntheticPassage);
  });
  it.each(["missing", "metadata", "abstract"])(
    "requires review for %s and never calls AI without full text",
    async (kind) => {
      const p = provider("supported", syntheticPassage, "supports");
      const result = await verifyClaim(
        claim,
        [],
        kind === "missing" ? [] : [syntheticPublication()],
        kind === "abstract" ? [{ ...evidence, evidence_type: "abstract" }] : [],
        p,
      );
      expect(result.verification).toMatchObject({
        verdict: "needs_review",
        confidence: null,
        requires_human_review: 1,
      });
      expect(p.generate).not.toHaveBeenCalled();
    },
  );
  it("requires an exact contradictory passage and keeps missing statistics out of negative verdicts", async () => {
    const contradiction =
      "The learning application did not improve examination scores; scores decreased by 5% in the pilot group.";
    const result = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [{ ...evidence, evidence_text: contradiction }],
      provider("contradictory", contradiction, "contradicts"),
    );
    expect(result.verification.verdict).toBe("contradictory");
    const missing = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [evidence],
      provider("contradictory", syntheticPassage, "contradicts"),
    );
    expect(missing.verification.verdict).toBe("needs_review");
  });
  it("rejects invented quotations, sources and page locations after one retry", async () => {
    const p = provider(
      "supported",
      "An invented 30% increase was proven by this synthetic study.",
      "supports",
    );
    await expect(
      verifyClaim(claim, [], [syntheticPublication()], [evidence], p),
    ).rejects.toMatchObject({ code: "invalid_ai_output" });
    expect(p.generate).toHaveBeenCalledTimes(2);
    const wrongLocation = {
      ...evidence,
      evidence_location: "A different actual section",
    };
    await expect(
      verifyClaim(
        claim,
        [],
        [syntheticPublication()],
        [wrongLocation],
        provider("partially_supported"),
      ),
    ).rejects.toMatchObject({ code: "invalid_ai_output" });
  });
  it("downgrades unsupported numerical certainty and age-only outdatedness", async () => {
    const passage =
      "The learning application improved examination scores in the synthetic pilot group.";
    const numerical = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [{ ...evidence, evidence_text: passage }],
      provider("supported", passage, "supports"),
    );
    expect(numerical.verification.verdict).toBe("partially_supported");
    const unreported = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [evidence],
      provider("supported", syntheticPassage, "supports"),
    );
    expect(unreported.verification.verdict).toBe("partially_supported");
    const old = await verifyClaim(
      claim,
      [],
      [syntheticPublication()],
      [evidence],
      provider("possibly_outdated", syntheticPassage, "context"),
    );
    expect(old.verification.verdict).toBe("needs_review");
    expect(numericTokens("A 30% result [1, 2] and a 5% decrease.")).toEqual([
      "30%",
      "5%",
    ]);
  });
  it.each([
    [
      "supported",
      "supports",
      "The learning application improved examination scores by 30% in the stated synthetic study population.",
    ],
    [
      "unsupported",
      "does_not_support",
      "The learning application results do not support a 30% improvement in examination scores in this synthetic population.",
    ],
  ])(
    "accepts %s only with the corresponding full-text quotation",
    async (verdict, relation, passage) => {
      const result = await verifyClaim(
        claim,
        [],
        [syntheticPublication()],
        [{ ...evidence, evidence_text: passage }],
        provider(verdict, passage, relation),
      );
      expect(result.verification.verdict).toBe(verdict);
      expect(JSON.parse(result.verification.evidence_ids_json)).toHaveLength(1);
    },
  );
});
