import type { Claim, ResearchDocument, VerificationReport } from "../types";

export const demoDocument: ResearchDocument = {
  id: "demo-document",
  name: "Research review — illustrative sample.pdf",
  size: 2735,
  pageCount: 2,
  createdAt: "2026-11-19T05:30:00.000Z",
  status: "complete",
  mode: "demo",
};
const records: Omit<Claim, "id" | "documentId">[] = [
  {
    text: "In the study sample, structured retrieval practice improved delayed recall compared with rereading.",
    citation: "Morgan & Lee, 2022 [1]",
    verdict: "Supported",
    confidence: 94,
    publication: {
      title:
        "Retrieval practice and delayed recall in undergraduate learning (fictional)",
      authors: ["A. Morgan", "S. Lee"],
      year: 2022,
    },
    evidence:
      "At the seven-day assessment, the retrieval-practice group recalled more items than the rereading group in this undergraduate sample.",
    evidenceReference: "Illustrative passage · Results, p. 4",
    explanation:
      "The claim preserves the population, comparison, and assessment interval stated in this fictional evidence passage.",
    limitations: [
      "Illustrative study and passage; no real publication was retrieved.",
      "The result does not establish effects in other populations.",
    ],
    humanReview:
      "Check the original publication and study design before citing this statement.",
  },
  {
    text: "Remote monitoring reduces hospital admissions for all patients with chronic conditions.",
    citation: "Patel et al., 2021 [2]",
    verdict: "Partially Supported",
    confidence: 82,
    publication: {
      title: "Remote monitoring in a selected heart-failure cohort (fictional)",
      authors: ["R. Patel", "J. Chen"],
      year: 2021,
    },
    evidence:
      "Fewer admissions were observed among enrolled adults with stable heart failure. The trial did not include other chronic conditions.",
    evidenceReference: "Illustrative passage · Discussion, p. 8",
    explanation:
      "The passage supports a narrower population. The claim expands the result to all chronic conditions, which the study did not examine.",
    limitations: [
      "Fictional study used only to demonstrate scope checking.",
      "No evidence for the claim’s universal wording.",
    ],
    humanReview:
      "Narrow the claim to the studied cohort and inspect eligibility criteria.",
  },
  {
    text: "The cited survey proves that social media use causes depression in adolescents.",
    citation: "Rivera et al., 2020 [3]",
    verdict: "Unsupported",
    confidence: 91,
    publication: {
      title: "Digital media habits and self-reported wellbeing (fictional)",
      authors: ["C. Rivera", "M. Park"],
      year: 2020,
    },
    evidence:
      "The cross-sectional survey found an association between reported media use and wellbeing scores. Directionality and causation cannot be inferred.",
    evidenceReference: "Illustrative passage · Limitations, p. 6",
    explanation:
      "An observational association does not demonstrate causation. The passage explicitly cautions against the causal interpretation.",
    limitations: [
      "Illustrative data, with no genuine causal assessment.",
      "Cross-sectional design cannot resolve directionality.",
    ],
    humanReview:
      "Replace causal wording with an association if the original source supports it.",
  },
  {
    text: "The intervention produced a statistically significant improvement in the primary outcome.",
    citation: "Wilson & Shah, 2023 [4]",
    verdict: "Contradictory",
    confidence: 96,
    publication: {
      title: "A randomized pilot of a learning intervention (fictional)",
      authors: ["D. Wilson", "N. Shah"],
      year: 2023,
    },
    evidence:
      "The primary outcome did not differ significantly between the intervention and control groups (p = 0.31).",
    evidenceReference: "Illustrative passage · Primary outcome, p. 5",
    explanation:
      "The statement says the primary result was significant; the fictional source explicitly reports that it was not.",
    limitations: [
      "The study and numerical result are invented for demonstration.",
      "No real trial data were assessed.",
    ],
    humanReview: "Inspect the primary-outcome table and correct the statement.",
  },
  {
    text: "This 2014 guideline remains the latest recommendation for routine screening.",
    citation: "Screening working group, 2014 [5]",
    verdict: "Potentially Outdated",
    confidence: 76,
    publication: {
      title: "Routine screening recommendations, 2014 edition (fictional)",
      authors: ["Screening working group"],
      year: 2014,
    },
    evidence:
      "These recommendations reflect evidence reviewed through December 2013 and should be reconsidered as further evidence becomes available.",
    evidenceReference: "Illustrative passage · Scope, p. 2",
    explanation:
      "The passage establishes an old evidence cutoff. Its age alone cannot prove replacement; the claim of being the latest needs a current guideline search.",
    limitations: [
      "No real guideline or superseding publication was searched.",
      "Publication age alone does not invalidate a recommendation.",
    ],
    humanReview:
      "Search the issuing body for the current version before describing this as the latest guidance.",
  },
  {
    text: "The supplementary analysis confirms that the effect persists in every subgroup.",
    citation: "Kim et al., 2024 [6]",
    verdict: "Needs Human Review",
    confidence: null,
    publication: {
      title: "Subgroup analysis of a multi-site study (fictional)",
      authors: ["H. Kim", "E. Taylor"],
      year: 2024,
    },
    evidence: null,
    explanation:
      "The relevant supplementary passage is unavailable in this example. No evidence-based verdict or confidence can be assigned.",
    limitations: [
      "Supplementary evidence is unavailable.",
      "Fictional citation; no real source was retrieved.",
    ],
    humanReview:
      "Obtain the supplementary material and assess each subgroup, including uncertainty and multiple comparisons.",
  },
];
export function createDemoReport(
  document: ResearchDocument,
): VerificationReport {
  return {
    document: { ...document, status: "complete" },
    claims: records.map((record, index) => ({
      ...record,
      id: `${document.id}-C0${index + 1}`,
      documentId: document.id,
    })),
    generatedAt: new Date().toISOString(),
    limitations: [
      "All claims, authors, publications, evidence passages, confidence scores, and findings are illustrative demo data.",
      "Uploaded PDF text is extracted locally, but the sample findings are not derived from or a verification of that document.",
      "No original research was searched or retrieved. These findings must not be used as scientific evidence.",
      "Live verification requires the separately developed backend and human assessment of the original sources.",
    ],
  };
}
