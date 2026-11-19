import { ApiError } from "../middleware/error.middleware";
import type {
  DocumentRow,
  ClaimRow,
  CitationRow,
  JobRow,
  ClaimCitationRow,
  PublicationCandidate,
  SourceRow,
  EvidenceRow,
  VerificationRow,
  ReportData,
} from "../types";

export class Repository {
  constructor(private db: D1Database) {}
  statement(sql: string, ...values: (string | number | null)[]) {
    return this.db.prepare(sql).bind(...values);
  }
  document(id: string) {
    return this.statement(
      "SELECT * FROM documents WHERE id = ?",
      id,
    ).first<DocumentRow>();
  }
  claim(id: string) {
    return this.statement(
      "SELECT * FROM claims WHERE id = ?",
      id,
    ).first<ClaimRow>();
  }
  job(documentId: string) {
    return this.statement(
      "SELECT * FROM analysis_jobs WHERE document_id = ?",
      documentId,
    ).first<JobRow>();
  }
  jobById(documentId: string, id: string) {
    return this.statement(
      "SELECT * FROM analysis_jobs WHERE document_id = ? AND id = ?",
      documentId,
      id,
    ).first<JobRow>();
  }
  verification(claimId: string) {
    return this.statement(
      "SELECT * FROM verifications WHERE claim_id = ?",
      claimId,
    ).first<VerificationRow>();
  }
  async insertDocument(
    row: Pick<
      DocumentRow,
      | "id"
      | "filename"
      | "file_size"
      | "page_count"
      | "pdf_key"
      | "text_key"
      | "access_token_hash"
    >,
  ) {
    const result = await this.statement(
      "INSERT INTO documents (id, filename, file_size, page_count, pdf_key, text_key, access_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
      row.id,
      row.filename,
      row.file_size,
      row.page_count,
      row.pdf_key,
      row.text_key,
      row.access_token_hash,
    ).first<DocumentRow>();
    if (!result) throw new Error("document_insert_failed");
    return result;
  }
  async acquireLease(documentId: string) {
    const token = crypto.randomUUID();
    const row = await this.statement(
      "UPDATE documents SET lease_token = ?, lease_expires_at = ? WHERE id = ? AND (lease_expires_at IS NULL OR lease_expires_at < ?) RETURNING id",
      token,
      Date.now() + 120000,
      documentId,
      Date.now(),
    ).first();
    if (!row)
      throw new ApiError(
        409,
        "document_busy",
        "This document is already processing. Retry in a few seconds.",
      );
    return token;
  }
  async assertLease(documentId: string, token: string) {
    const row = await this.statement(
      "SELECT id FROM documents WHERE id = ? AND lease_token = ? AND lease_expires_at > ?",
      documentId,
      token,
      Date.now(),
    ).first();
    if (!row)
      throw new ApiError(
        409,
        "lease_expired",
        "Processing took too long. Retry to resume from saved progress.",
      );
  }
  releaseLease(documentId: string, token: string) {
    return this.statement(
      "UPDATE documents SET lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?",
      documentId,
      token,
    ).run();
  }
  async ensureJob(documentId: string, totalChunks: number) {
    await this.statement(
      "INSERT OR IGNORE INTO analysis_jobs (id, document_id, status, current_stage, total_chunks) VALUES (?, ?, 'queued', 'extraction', ?)",
      crypto.randomUUID(),
      documentId,
      totalChunks,
    ).run();
    return (await this.job(documentId))!;
  }
  async stage(
    documentId: string,
    stage: "extraction" | "mapping" | "verification" | "report",
  ) {
    await this.db.batch([
      this.statement(
        "UPDATE analysis_jobs SET status = 'running', current_stage = ?, error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id = ?",
        stage,
        documentId,
      ),
      this.statement(
        "UPDATE documents SET status = 'processing', error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        documentId,
      ),
    ]);
  }
  async saveChunk(
    documentId: string,
    job: JobRow,
    claims: ClaimRow[],
    citations: CitationRow[],
    diagnostics: string[],
    token: string,
  ) {
    await this.assertLease(documentId, token);
    const statements: D1PreparedStatement[] = citations.map((c) =>
      this.statement(
        "INSERT OR IGNORE INTO citations (id, document_id, citation_key, reference_text, doi, title, authors_json, publication_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        c.id,
        documentId,
        c.citation_key,
        c.reference_text,
        c.doi,
        c.title,
        c.authors_json,
        c.publication_year,
      ),
    );
    for (const c of claims)
      statements.push(
        this.statement(
          "INSERT OR IGNORE INTO claims (id, document_id, claim_text, page_number, claim_type, extraction_confidence, citation_keys_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
          c.id,
          documentId,
          c.claim_text,
          c.page_number,
          c.claim_type,
          c.extraction_confidence,
          c.citation_keys_json,
        ),
      );
    statements.push(
      this.statement(
        "UPDATE documents SET diagnostics_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        JSON.stringify(diagnostics),
        documentId,
      ),
      this.statement(
        "UPDATE analysis_jobs SET cursor = ?, progress = ?, status = 'waiting', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND cursor = ?",
        job.cursor + 1,
        (40 * (job.cursor + 1)) / job.total_chunks,
        job.id,
        job.cursor,
      ),
    );
    await this.db.batch(statements);
  }
  async saveMappings(mappings: ClaimCitationRow[]) {
    if (!mappings.length) return;
    await this.db.batch(
      mappings.map((m) =>
        this.statement(
          "INSERT OR IGNORE INTO claim_citations (claim_id, citation_id, document_id, match_method, match_confidence) VALUES (?, ?, ?, ?, ?)",
          m.claim_id,
          m.citation_id,
          m.document_id,
          m.match_method,
          m.match_confidence,
        ),
      ),
    );
  }
  saveDiagnostics(documentId: string, diagnostics: string[]) {
    return this.statement(
      "UPDATE documents SET diagnostics_json = ? WHERE id = ?",
      JSON.stringify([...new Set(diagnostics)]),
      documentId,
    ).run();
  }
  async finishExtraction(documentId: string) {
    const count = await this.statement(
      "SELECT count(*) AS total FROM claims WHERE document_id = ?",
      documentId,
    ).first<{ total: number }>();
    const empty = count!.total === 0;
    await this.db.batch([
      this.statement(
        "UPDATE analysis_jobs SET extraction_complete = 1, status = ?, current_stage = ?, progress = ?, error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id = ?",
        empty ? "complete" : "waiting",
        empty ? "complete" : "awaiting_verification",
        empty ? 100 : 45,
        documentId,
      ),
      this.statement(
        "UPDATE documents SET status = ?, error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        empty ? "complete" : "processing",
        documentId,
      ),
    ]);
  }
  async failJob(documentId: string, message: string, token: string) {
    await this.assertLease(documentId, token);
    await this.db.batch([
      this.statement(
        "UPDATE analysis_jobs SET status = 'error', error_message = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id = ?",
        message,
        documentId,
      ),
      this.statement(
        "UPDATE documents SET status = 'error', error_message = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        message,
        documentId,
      ),
    ]);
  }
  async resolveCitation(
    citation: CitationRow,
    candidates: { publication: PublicationCandidate; score: number }[],
    selectedId: string | null,
    notes: string[],
  ) {
    const result = candidates.length
      ? await this.db.batch<SourceRow>(
          candidates.map(({ publication: p }) =>
            this.statement(
              `INSERT INTO sources (id, provider, external_id, title, doi, authors_json, abstract, publication_year, landing_page_url, open_access_url, access_status, locations_json, providers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, external_id) DO UPDATE SET title = excluded.title, doi = excluded.doi, authors_json = excluded.authors_json,
       abstract = excluded.abstract, publication_year = excluded.publication_year, landing_page_url = excluded.landing_page_url,
       open_access_url = excluded.open_access_url, access_status = excluded.access_status, locations_json = excluded.locations_json,
       providers_json = excluded.providers_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING *`,
              p.id,
              p.provider,
              p.externalId,
              p.title,
              p.doi,
              JSON.stringify(p.authors),
              p.abstract,
              p.year,
              p.url,
              p.openAccessUrl,
              p.accessStatus,
              JSON.stringify(p.locations),
              JSON.stringify(p.providers),
            ),
          ),
        )
      : [];
    const sources = result.map((r) => r.results[0]);
    // Keep historical matches: deleting them would cascade into previously saved evidence.
    const statements = [
      this.statement(
        "UPDATE citation_matches SET is_selected = 0 WHERE citation_id = ?",
        citation.id,
      ),
    ];
    sources.forEach((s, i) =>
      statements.push(
        this.statement(
          "INSERT INTO citation_matches (citation_id, source_id, match_score, is_selected) VALUES (?, ?, ?, ?) ON CONFLICT(citation_id, source_id) DO UPDATE SET match_score = excluded.match_score, is_selected = excluded.is_selected",
          citation.id,
          s.id,
          candidates[i].score,
          candidates[i].publication.id === selectedId ? 1 : 0,
        ),
      ),
    );
    statements.push(
      this.statement(
        "UPDATE citations SET resolution_notes_json = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        JSON.stringify(notes),
        citation.id,
      ),
    );
    await this.db.batch(statements);
    return (
      sources.find((_, i) => candidates[i].publication.id === selectedId) ??
      null
    );
  }
  async cachedResolution(citationId: string) {
    return this.statement(
      "SELECT s.* FROM sources s JOIN citation_matches m ON m.source_id = s.id WHERE m.citation_id = ? AND m.is_selected = 1",
      citationId,
    ).first<SourceRow>();
  }
  async cachedSources(citation: CitationRow) {
    const result = await this.statement(
      "SELECT * FROM sources WHERE (? IS NOT NULL AND doi = ?) OR (? IS NOT NULL AND lower(title) = lower(?)) ORDER BY updated_at DESC LIMIT 10",
      citation.doi,
      citation.doi,
      citation.title,
      citation.title,
    ).all<SourceRow>();
    return result.results;
  }
  async saveVerification(
    documentId: string,
    verification: VerificationRow,
    evidence: EvidenceRow[],
    token: string,
  ) {
    await this.assertLease(documentId, token);
    const statements = evidence.map((e) =>
      this.statement(
        "INSERT INTO evidence (id, claim_id, citation_id, source_id, evidence_text, evidence_location, evidence_type, retrieval_method, source_url, relation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        e.id,
        e.claim_id,
        e.citation_id,
        e.source_id,
        e.evidence_text,
        e.evidence_location,
        e.evidence_type,
        e.retrieval_method,
        e.source_url,
        e.relation,
        e.created_at,
      ),
    );
    statements.push(
      this.statement(
        "INSERT INTO verifications (id, claim_id, verdict, confidence, explanation, limitations_json, evidence_ids_json, requires_human_review, model_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        verification.id,
        verification.claim_id,
        verification.verdict,
        verification.confidence,
        verification.explanation,
        verification.limitations_json,
        verification.evidence_ids_json,
        verification.requires_human_review,
        verification.model_name,
      ),
    );
    await this.db.batch(statements);
  }
  async updateVerificationProgress(documentId: string) {
    const counts = await this.statement(
      "SELECT count(*) AS total, count(v.id) AS verified FROM claims c LEFT JOIN verifications v ON v.claim_id = c.id WHERE c.document_id = ?",
      documentId,
    ).first<{ total: number; verified: number }>();
    const complete = counts!.total === counts!.verified;
    await this.db.batch([
      this.statement(
        "UPDATE analysis_jobs SET progress = ?, status = ?, current_stage = ?, error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id = ? AND extraction_complete = 1",
        complete ? 100 : 45 + (50 * counts!.verified) / counts!.total,
        complete ? "complete" : "waiting",
        complete ? "complete" : "verification",
        documentId,
      ),
      this.statement(
        "UPDATE documents SET status = ?, error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        complete ? "complete" : "processing",
        documentId,
      ),
    ]);
  }
  async reportData(documentId: string): Promise<ReportData> {
    const queries = [
      "SELECT * FROM claims WHERE document_id = ? ORDER BY created_at, id",
      "SELECT * FROM citations WHERE document_id = ? ORDER BY created_at, citation_key",
      "SELECT * FROM claim_citations WHERE document_id = ?",
      "SELECT DISTINCT s.* FROM sources s JOIN citation_matches m ON m.source_id = s.id JOIN citations c ON c.id = m.citation_id WHERE c.document_id = ?",
      "SELECT m.* FROM citation_matches m JOIN citations c ON c.id = m.citation_id WHERE c.document_id = ?",
      "SELECT e.* FROM evidence e JOIN claims c ON c.id = e.claim_id WHERE c.document_id = ? ORDER BY e.created_at, e.id",
      "SELECT v.* FROM verifications v JOIN claims c ON c.id = v.claim_id WHERE c.document_id = ?",
      "SELECT * FROM analysis_jobs WHERE document_id = ?",
    ];
    const r = await this.db.batch(
      queries.map((q) => this.statement(q, documentId)),
    );
    return Object.fromEntries(
      [
        "claims",
        "citations",
        "mappings",
        "sources",
        "matches",
        "evidence",
        "verifications",
        "jobs",
      ].map((key, i) => [key, r[i].results]),
    ) as unknown as ReportData;
  }
}

export function publicationFromRow(s: SourceRow): PublicationCandidate {
  return {
    id: s.id,
    provider: s.provider,
    externalId: s.external_id,
    title: s.title,
    doi: s.doi,
    authors: JSON.parse(s.authors_json),
    abstract: s.abstract,
    year: s.publication_year,
    url: s.landing_page_url,
    openAccessUrl: s.open_access_url,
    accessStatus: s.access_status,
    locations: JSON.parse(s.locations_json),
    providers: JSON.parse(s.providers_json),
  };
}
