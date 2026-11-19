PRAGMA foreign_keys = ON;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  page_count INTEGER NOT NULL CHECK(page_count BETWEEN 1 AND 100),
  pdf_key TEXT NOT NULL UNIQUE,
  text_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','processing','complete','error')),
  error_message TEXT,
  access_token_hash TEXT NOT NULL CHECK(length(access_token_hash) = 64),
  diagnostics_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(diagnostics_json) AND json_type(diagnostics_json) = 'array'),
  lease_token TEXT,
  lease_expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL CHECK(length(claim_text) BETWEEN 10 AND 2000),
  page_number INTEGER CHECK(page_number BETWEEN 1 AND 100),
  claim_type TEXT NOT NULL CHECK(claim_type IN ('factual','scientific','statistical','numerical','conclusion')),
  extraction_confidence REAL CHECK(extraction_confidence BETWEEN 0 AND 1),
  citation_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(citation_keys_json) AND json_type(citation_keys_json) = 'array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, claim_text),
  UNIQUE(id, document_id)
);

CREATE TABLE citations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  citation_key TEXT NOT NULL CHECK(length(citation_key) BETWEEN 1 AND 160),
  reference_text TEXT NOT NULL CHECK(length(reference_text) BETWEEN 1 AND 4000),
  doi TEXT,
  title TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(authors_json) AND json_type(authors_json) = 'array'),
  publication_year INTEGER CHECK(publication_year BETWEEN 1500 AND 2100),
  resolution_notes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(resolution_notes_json) AND json_type(resolution_notes_json) = 'array'),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, citation_key),
  UNIQUE(id, document_id)
);

CREATE TABLE claim_citations (
  claim_id TEXT NOT NULL,
  citation_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  match_method TEXT NOT NULL CHECK(match_method IN ('inline','adjacent','ai_assisted')),
  match_confidence REAL NOT NULL CHECK(match_confidence BETWEEN 0 AND 1),
  PRIMARY KEY(claim_id, citation_id),
  FOREIGN KEY(claim_id, document_id) REFERENCES claims(id, document_id) ON DELETE CASCADE,
  FOREIGN KEY(citation_id, document_id) REFERENCES citations(id, document_id) ON DELETE CASCADE
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('crossref','openalex')),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 2000),
  doi TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(authors_json) AND json_type(authors_json) = 'array'),
  abstract TEXT,
  publication_year INTEGER CHECK(publication_year BETWEEN 1500 AND 2100),
  landing_page_url TEXT,
  open_access_url TEXT,
  access_status TEXT NOT NULL CHECK(access_status IN ('open_access','abstract_only','metadata_only','unknown')),
  locations_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(locations_json) AND json_type(locations_json) = 'array'),
  providers_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(providers_json) AND json_type(providers_json) = 'array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(provider, external_id)
);

CREATE TABLE citation_matches (
  citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  match_score REAL NOT NULL CHECK(match_score BETWEEN 0 AND 1),
  is_selected INTEGER NOT NULL CHECK(is_selected IN (0,1)),
  PRIMARY KEY(citation_id, source_id)
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  citation_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_text TEXT NOT NULL CHECK(length(evidence_text) BETWEEN 1 AND 4000),
  evidence_location TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('full_text','abstract')),
  retrieval_method TEXT NOT NULL,
  source_url TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'context' CHECK(relation IN ('supports','partially_supports','does_not_support','contradicts','context')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(claim_id, citation_id) REFERENCES claim_citations(claim_id, citation_id) ON DELETE CASCADE,
  FOREIGN KEY(citation_id, source_id) REFERENCES citation_matches(citation_id, source_id) ON DELETE CASCADE
);

CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK(verdict IN ('supported','partially_supported','unsupported','contradictory','possibly_outdated','needs_review')),
  confidence REAL CHECK(confidence BETWEEN 0 AND 1),
  explanation TEXT NOT NULL,
  limitations_json TEXT NOT NULL CHECK(json_valid(limitations_json) AND json_type(limitations_json) = 'array'),
  evidence_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_ids_json) AND json_type(evidence_ids_json) = 'array'),
  requires_human_review INTEGER NOT NULL CHECK(requires_human_review IN (0,1)),
  model_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued','running','waiting','complete','error')),
  current_stage TEXT NOT NULL CHECK(current_stage IN ('extraction','mapping','awaiting_verification','verification','report','complete')),
  progress REAL NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor >= 0),
  total_chunks INTEGER NOT NULL CHECK(total_chunks >= 1),
  extraction_complete INTEGER NOT NULL DEFAULT 0 CHECK(extraction_complete IN (0,1)),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(cursor <= total_chunks),
  CHECK(status != 'complete' OR (progress = 100 AND extraction_complete = 1))
);

CREATE INDEX documents_created_at ON documents(created_at);
CREATE INDEX claims_document ON claims(document_id);
CREATE INDEX citations_document ON citations(document_id);
CREATE INDEX claim_citations_citation ON claim_citations(citation_id);
CREATE INDEX sources_doi ON sources(doi);
CREATE INDEX sources_title ON sources(title);
CREATE INDEX citation_matches_source ON citation_matches(source_id);
CREATE UNIQUE INDEX citation_matches_selected ON citation_matches(citation_id) WHERE is_selected = 1;
CREATE INDEX evidence_claim ON evidence(claim_id);
CREATE INDEX evidence_source ON evidence(source_id);
CREATE INDEX verifications_verdict ON verifications(verdict);
CREATE INDEX analysis_jobs_status ON analysis_jobs(status, updated_at);
