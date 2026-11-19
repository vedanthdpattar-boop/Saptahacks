export interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;
  AI: Ai;
  API_RATE_LIMITER: RateLimit;
  RESEARCH_RATE_LIMITER: RateLimit;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  FRONTEND_ORIGIN?: string;
  CROSSREF_CONTACT_EMAIL?: string;
  GEMINI_API_KEY?: string;
  OPENALEX_API_KEY?: string;
  MAX_PDF_BYTES?: string;
  MAX_TEXT_BYTES?: string;
}
export type AppEnv = {
  Bindings: Bindings;
  Variables: { document: DocumentRow; requestId: string };
};
export interface DocumentRow {
  id: string;
  filename: string;
  file_size: number;
  page_count: number;
  pdf_key: string;
  text_key: string;
  status: "uploaded" | "processing" | "complete" | "error";
  error_message: string | null;
  access_token_hash: string;
  diagnostics_json: string;
  lease_token: string | null;
  lease_expires_at: number | null;
  created_at: string;
  updated_at: string;
}
export interface ClaimRow {
  id: string;
  document_id: string;
  claim_text: string;
  page_number: number | null;
  claim_type: string;
  extraction_confidence: number | null;
  citation_keys_json: string;
  created_at: string;
}
export interface CitationRow {
  id: string;
  document_id: string;
  citation_key: string;
  reference_text: string;
  doi: string | null;
  title: string | null;
  authors_json: string;
  publication_year: number | null;
  resolution_notes_json: string;
  resolved_at: string | null;
  created_at: string;
}
export interface ClaimCitationRow {
  claim_id: string;
  citation_id: string;
  document_id: string;
  match_method: string;
  match_confidence: number;
}
export interface PublicationCandidate {
  id: string;
  provider: "crossref" | "openalex";
  externalId: string;
  title: string;
  doi: string | null;
  authors: string[];
  abstract: string | null;
  year: number | null;
  url: string | null;
  openAccessUrl: string | null;
  accessStatus: "open_access" | "abstract_only" | "metadata_only" | "unknown";
  locations: string[];
  providers: string[];
}
export interface SourceRow {
  id: string;
  provider: PublicationCandidate["provider"];
  external_id: string;
  title: string;
  doi: string | null;
  authors_json: string;
  abstract: string | null;
  publication_year: number | null;
  landing_page_url: string | null;
  open_access_url: string | null;
  access_status: PublicationCandidate["accessStatus"];
  locations_json: string;
  providers_json: string;
  created_at: string;
  updated_at: string;
}
export interface CitationMatchRow {
  citation_id: string;
  source_id: string;
  match_score: number;
  is_selected: number;
}
export type EvidenceRelation =
  | "supports"
  | "partially_supports"
  | "does_not_support"
  | "contradicts"
  | "context";
export interface EvidenceRow {
  id: string;
  claim_id: string;
  citation_id: string;
  source_id: string;
  evidence_text: string;
  evidence_location: string;
  evidence_type: "full_text" | "abstract";
  retrieval_method: string;
  source_url: string;
  relation: EvidenceRelation;
  created_at: string;
}
export type Verdict =
  | "supported"
  | "partially_supported"
  | "unsupported"
  | "contradictory"
  | "possibly_outdated"
  | "needs_review";
export interface VerificationRow {
  id: string;
  claim_id: string;
  verdict: Verdict;
  confidence: number | null;
  explanation: string;
  limitations_json: string;
  evidence_ids_json: string;
  requires_human_review: number;
  model_name: string;
  created_at: string;
}
export interface JobRow {
  id: string;
  document_id: string;
  status: "queued" | "running" | "waiting" | "complete" | "error";
  current_stage: string;
  progress: number;
  cursor: number;
  total_chunks: number;
  extraction_complete: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReportData {
  claims: ClaimRow[];
  citations: CitationRow[];
  mappings: ClaimCitationRow[];
  sources: SourceRow[];
  matches: CitationMatchRow[];
  evidence: EvidenceRow[];
  verifications: VerificationRow[];
  jobs: JobRow[];
}
