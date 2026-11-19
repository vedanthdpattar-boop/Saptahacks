export const verdicts = [
  "Supported",
  "Partially Supported",
  "Unsupported",
  "Contradictory",
  "Potentially Outdated",
  "Needs Human Review",
] as const;
export type Verdict = (typeof verdicts)[number];
export type Mode = "demo" | "live";
export interface ResearchDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  createdAt: string;
  status: "uploaded" | "processing" | "complete" | "error";
  mode: Mode;
}
export interface Publication {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url?: string;
}
export interface Claim {
  id: string;
  documentId: string;
  text: string;
  citation: string;
  verdict: Verdict;
  confidence: number | null;
  publication: Publication | null;
  evidence: string | null;
  evidenceReference?: string;
  explanation: string;
  limitations: string[];
  humanReview: string;
}
export interface VerificationReport {
  document: ResearchDocument;
  claims: Claim[];
  generatedAt: string;
  limitations: string[];
  citations?: Citation[];
  citationDiagnostics?: string[];
}
export interface Citation {
  id: string;
  documentId: string;
  key: string;
  referenceText: string;
  doi: string | null;
  title: string | null;
  authors: string[];
  year: number | null;
  status: "unchecked" | "matched" | "needs_review";
  checkedAt: string | null;
  publication: Publication | null;
  alternatives: (Publication & { score: number; selected: boolean })[];
  notes: string[];
}
export type CitationStyle = "apa" | "ieee";
export interface FormattedCitation {
  doi: string;
  style: CitationStyle;
  text: string;
  publication: Publication;
  notes: string[];
}
export interface PdfExtraction {
  text: string;
  pageCount: number;
}
export interface UploadDraft extends PdfExtraction {
  file: File;
}
