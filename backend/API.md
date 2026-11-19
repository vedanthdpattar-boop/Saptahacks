# CiteVerify API

All success responses are direct JSON, without a `data` envelope. Examples with claims, publications, DOIs or passages below are **synthetic examples only**, not real research or verified findings. Replace all document/claim/job IDs and tokens with values returned by your own requests.

Base origin: `http://localhost:8787` locally; `https://citeverify-api.citeverify-backend.workers.dev` for the deployed API.

| Method | Path                             | Authentication        | Result                                       |
| ------ | -------------------------------- | --------------------- | -------------------------------------------- |
| GET    | `/api/health`                    | None                  | D1 reachability/service status               |
| POST   | `/api/documents`                 | None                  | Private upload and one-time token return     |
| GET    | `/api/documents/:id`             | Document token        | Safe document metadata                       |
| POST   | `/api/documents/:id/extract`     | Document token        | Process one extraction chunk/resume analysis |
| GET    | `/api/documents/:id/jobs/:jobId` | Document token        | Read-only job status                         |
| GET    | `/api/documents/:id/claims`      | Document token        | Array of extracted claim DTOs                |
| GET    | `/api/claims/:id`                | Owning document token | Claim, citations and evidence                |
| POST   | `/api/claims/:id/verify`         | Owning document token | Idempotent stored verification               |
| GET    | `/api/documents/:id/report`      | Document token        | Traceable report and summary counts          |

Protected calls use `Authorization: Bearer <accessToken>`. Tokens are not query parameters. A different document's token never authorizes a claim or job. UUID path parameters are validated. GET endpoints do not start processing or mutate progress.

## Health

```sh
curl http://localhost:8787/api/health
```

```json
{
  "status": "ok",
  "service": "citeverify-api",
  "mode": "live",
  "aiProvider": "workers-ai"
}
```

This probes D1 and service configuration, not live AI availability, private storage availability or research API quotas.

## Upload

PDF.js runs in the existing browser frontend. Send exactly one of each multipart field: `file` (application/pdf), `extractedText`, `pageCount`.

```sh
curl --request POST http://localhost:8787/api/documents \
  --form 'file=@paper.pdf;type=application/pdf' \
  --form 'extractedText=<paper-text.txt' \
  --form 'pageCount=2'
```

HTTP 201 example (the token below is a placeholder):

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "paper.pdf",
  "size": 24000,
  "pageCount": 2,
  "createdAt": "2026-11-19T00:00:00.000Z",
  "status": "uploaded",
  "mode": "live",
  "errorMessage": null,
  "accessToken": "<43-character-base64url-token-returned-only-on-upload>"
}
```

The initial limit is 10 MiB, 200000 UTF-8 extracted-text bytes, and 1–100 pages. The PDF MIME type and initial `%PDF-1.x`/`%PDF-2.0` signature are checked; this is not full server-side PDF parsing. Empty/unreadable text is rejected. PDFs and text are private KV values (or R2 objects when that binding is configured). Successful database insertion stores only a SHA-256 token hash. Object cleanup runs on storage/database failure. KV text that is not readable yet returns a retryable 503 during extraction; retry in a minute without uploading again.

Set task-specific shell values using your returned IDs/token:

```sh
CITEVERIFY_API=http://localhost:8787
CITEVERIFY_DOCUMENT_ID=YOUR_RETURNED_DOCUMENT_UUID
read -r CITEVERIFY_ACCESS_TOKEN
```

Paste the access token at the `read` prompt. Avoid putting a literal token into shared commands or shell history. The browser API service stores tokens automatically in `sessionStorage` and strips the token out of the document object handed to pages.

## Document and extraction jobs

```sh
curl "$CITEVERIFY_API/api/documents/$CITEVERIFY_DOCUMENT_ID" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
curl --request POST "$CITEVERIFY_API/api/documents/$CITEVERIFY_DOCUMENT_ID/extract" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
```

Extraction POST returns HTTP 202, including after an idempotent completed extraction. Example after one of two chunks:

```json
{
  "documentId": "11111111-1111-4111-8111-111111111111",
  "jobId": "22222222-2222-4222-8222-222222222222",
  "status": "waiting",
  "currentStage": "extraction",
  "progress": 20,
  "processedChunks": 1,
  "totalChunks": 2,
  "extractionComplete": false,
  "continuationRequired": true,
  "errorMessage": null,
  "updatedAt": "2026-11-19T00:00:01.000Z"
}
```

Save the returned job ID, then poll:

```sh
CITEVERIFY_JOB_ID=YOUR_RETURNED_JOB_UUID
curl "$CITEVERIFY_API/api/documents/$CITEVERIFY_DOCUMENT_ID/jobs/$CITEVERIFY_JOB_ID" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
```

While `continuationRequired` is true, repeat the extraction POST. GET does not advance a chunk. If status is `running`, wait and poll; an expired document lease makes continuation available so a crashed request can be resumed. If the job is `error`, resolve its `errorMessage` and retry the POST. The existing frontend handles this sequence, cancellation and busy-lease retries.

Extraction ending gives `extractionComplete: true`, `status: "waiting"`, `currentStage: "awaiting_verification"`, progress 45. Verify every returned claim to finish the full analysis. Only then does the analysis become complete at progress 100. Zero extracted claims can complete directly, with a zero-claim report. Unverified claims remain explicitly unverified in report metrics.

## Claims and verification

```sh
curl "$CITEVERIFY_API/api/documents/$CITEVERIFY_DOCUMENT_ID/claims" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
CITEVERIFY_CLAIM_ID=YOUR_RETURNED_CLAIM_UUID
curl "$CITEVERIFY_API/api/claims/$CITEVERIFY_CLAIM_ID" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
curl --request POST "$CITEVERIFY_API/api/claims/$CITEVERIFY_CLAIM_ID/verify" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
```

The claims endpoint returns an array; individual GET and POST verify return a claim object. A shortened **synthetic** verified example:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "documentId": "11111111-1111-4111-8111-111111111111",
  "text": "A learning application improved examination scores by 30%.",
  "citation": "[1] Synthetic pilot reference; not a real publication.",
  "verdict": "Partially Supported",
  "confidence": 78,
  "publication": {
    "title": "Synthetic pilot publication",
    "authors": ["Synthetic Author"],
    "year": 2023
  },
  "evidence": "The pilot group demonstrated improvement, but no 30% increase is reported.",
  "evidenceReference": "Synthetic Results section; actual runtime records include source URL, method and retrieval time.",
  "explanation": "The synthetic pilot reports improvement but does not establish an exact 30% increase.",
  "limitations": [
    "Synthetic example only. Confidence is not statistically calibrated."
  ],
  "humanReview": "Review the original publication and numerical result.",
  "pageNumber": null,
  "claimType": "statistical",
  "extractionConfidence": 0.8,
  "matchedCitations": [],
  "retrievedEvidence": [],
  "verification": {
    "verdict": "partially_supported",
    "confidence": 0.78,
    "confidenceType": "uncalibrated_evidence_strength",
    "explanation": "The exact 30% increase is not established by the synthetic passage.",
    "limitations": ["Synthetic example only."],
    "requiresHumanReview": true,
    "modelName": "synthetic-example-model",
    "createdAt": "2026-11-19T00:00:02.000Z",
    "evidence": []
  }
}
```

The example omits real identifiers/links. Every real evidence-based verdict has traceable records in `verification.evidence`, including `id`, exact `passage`, `sourceId`, `citationId`, actual `location`, `evidenceType`, `retrievalMethod`, `sourceUrl`, `retrievedAt`, `relation` and publication details. `retrievedEvidence` also retains the selected paragraph context. `matchedCitations` retains reference text, DOI, parsed metadata, association method/confidence, resolution diagnostics and scored alternative publications.

Legacy verdict labels are `Supported`, `Partially Supported`, `Unsupported`, `Contradictory`, `Potentially Outdated`, `Needs Human Review`, with display confidence 0–100 or null. The rich `verification.verdict` uses `supported`, `partially_supported`, `unsupported`, `contradictory`, `possibly_outdated`, `needs_review`, with confidence 0–1 or null. An extracted but unverified claim has `verification: null`; its legacy review label is a placeholder, not a completed verdict.

Missing publications/full text produce `needs_review`, not `unsupported`. Abstracts may be shown for context, with `evidenceType: "abstract"` and an explicit abstract-only reference, but cannot establish detailed factual/numerical support. Numerical absence cannot by itself establish contradiction. Possibly outdated requires actual later full-text comparison. AI quotations, source IDs and locations are validated before saving; repeated invalid output returns an error. Calling verify again returns the saved finding and does not rerun AI/retrieval. Previous results are not silently replaced.

## Report

```sh
curl "$CITEVERIFY_API/api/documents/$CITEVERIFY_DOCUMENT_ID/report" \
  --header "Authorization: Bearer $CITEVERIFY_ACCESS_TOKEN"
```

The response includes `document`, `claims`, `generatedAt`, `limitations`, `status`, `citationDiagnostics` and `summary`. A shortened summary for the synthetic example:

```json
{
  "totalClaims": 1,
  "verifiedClaims": 1,
  "unverifiedClaims": 0,
  "supportedClaims": 0,
  "partiallySupportedClaims": 1,
  "unsupportedClaims": 0,
  "contradictoryClaims": 0,
  "potentiallyOutdatedClaims": 0,
  "needsReviewClaims": 0,
  "claimsRequiringHumanReview": 1,
  "claimCitationMappingRate": 1,
  "citationMatchingRate": 1,
  "totalCitations": 1,
  "matchedPublications": 1,
  "verdictCounts": {
    "supported": 0,
    "partially_supported": 1,
    "unsupported": 0,
    "contradictory": 0,
    "possibly_outdated": 0,
    "needs_review": 0
  }
}
```

`claimCitationMappingRate` = extracted claims with any mapped reference / all extracted claims. `citationMatchingRate` = bibliography entries with a selected publication / all extracted bibliography entries. Both are ratios 0–1 or null when the denominator is zero. They measure matching coverage, not scientific integrity. Unused references are diagnosed and retained. Summary verdict counts include only stored verifications; `claimsRequiringHumanReview` also includes unverified claims. A partial report remains `status: "processing"` and states that analysis is incomplete.

## Errors and CORS

```json
{
  "error": {
    "code": "invalid_ai_output",
    "message": "The AI response failed JSON or evidence validation twice. Retry processing; no invalid findings were saved.",
    "requestId": "request-uuid"
  }
}
```

| HTTP | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 400  | Invalid fields, malformed PDF signature or UUID                                |
| 401  | Missing/wrong document token                                                   |
| 403  | Browser origin not configured                                                  |
| 404  | Document/claim/job/endpoint absent or not in the requested document            |
| 409  | `document_busy`, `lease_expired`, or extraction incomplete                     |
| 413  | PDF/text/body/chunk/claim/reference processing limit exceeded                  |
| 415  | Upload is not multipart                                                        |
| 429  | Native API rate limit; `Retry-After: 60`                                       |
| 500  | Storage/internal processing failure; no secrets or raw source data in messages |
| 502  | Invalid AI output after retry                                                  |
| 503  | AI/configuration/rate-limit binding unavailable                                |

External metadata/evidence failures are recorded as limitations when a conservative review finding can still be produced. Failures in claim extraction or AI full-text comparison pause the analysis with an actionable error rather than saving invented results. Successful API responses and errors use `Cache-Control: no-store`.

Browsers must use an exact `FRONTEND_ORIGIN` value. Preflight allows GET, POST, OPTIONS and Content-Type/Authorization headers. Wildcards, paths and trailing slashes are rejected. Native limits are approximate per Cloudflare location; there are no instance-local rate counters.
