# CiteVerify AI frontend

A complete React/Vite/TypeScript frontend for the Saptahacks scientific claim and citation verification project. All application code and configuration live in `frontend/`; backend and Cloudflare files are separate.

## Run locally

Use Node.js 24 LTS and npm.

```sh
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the URL Vite prints, normally http://127.0.0.1:5173. The default environment example enables the demo. Environment changes require restarting Vite (and rebuilding production assets).

```sh
npm run build
npm run preview
npm test
npm run test:e2e
```

Browser checks use installed Google Chrome in headless mode. If Chrome is unavailable, install it or change `channel: 'chrome'` in `playwright.config.ts` and install Playwright Chromium. Tests run a demo server on 4173 and a live-mode server on 4174. Ports must be available. Unit checks validate API response shapes, source-link protocols, multipart upload, and failure handling. Browser checks cover navigation, PDF selection/extraction/drop/removal, no-text and invalid-file states, search/filtering, claim comparison, graph selection, report printing, and responsive layouts.

PDF.js workers are bundled by Vite. `predev` and `prebuild` copy installed PDF.js CMaps, fonts, and WASM into the ignored `public/pdfjs/` directory so PDF extraction works without a runtime CDN. The IBM Plex Sans UI font loads from Google Fonts with a system-font fallback. No API secrets belong in Vite environment variables: they are public client configuration.

## Application flow

- `/` — compact home page with an interactive evidence preview.
- `/how-it-works` — verification process on its own page.
- `/features` — product features on their own page.
- `/dashboard` — session history, summary, and activity.
- `/upload` — PDF selection, drag and drop, extraction progress, and text preview.
- `/analysis` — run analysis on the selected file.
- `/documents/:id/analysis` — continue or retry an existing document.
- `/documents/:id/results` — all six verdicts, searchable/filterable/sortable claims.
- `/documents/:id/claims/:claimId` — exact claim, publication, evidence, explanation, limitations, and human review.
- `/documents/:id/graph` — five selectable evidence-trace nodes. `?claim=:claimId` selects a claim.
- `/documents/:id/report` — interactive summary, selectable claim findings, human review queue, limitations, and full report export.

**Save as PDF** opens the browser's native print dialog. Choose **Save as PDF** as the destination. The print layout removes workspace navigation and includes all claim text, source information, evidence, scores, and limitations. This preserves Unicode text without adding a separate PDF-generation dependency. The user completes the save in the print dialog; it is not an automatic download.

## Demo mode

```dotenv
VITE_API_BASE_URL=http://localhost:8787
VITE_DEMO_MODE=true
```

Open `/documents/demo-document/results` for the built-in report. A downloadable two-page text PDF is included at `/sample-research.pdf`.

**Every sample claim, author, publication, passage, numerical result, score, and verdict is fictional illustrative demo data.** There are no invented DOI links or links to unrelated real papers. Six records demonstrate Supported, Partially Supported, Unsupported, Contradictory, Potentially Outdated, and Needs Human Review. The latter has no evidence passage or assigned confidence.

Actual PDF text extraction runs locally. Starting demo analysis on any uploaded document shows the fixed sample findings; those findings are explicitly labelled and are **not extracted from or a verification of the uploaded document**. Demo processing stages use short illustrative delays. Uploaded documents and text are kept in browser memory, not localStorage, and never uploaded in demo mode. Reloading removes custom demo documents; the built-in sample remains accessible.

Dashboard document counts refer to completed documents in the current session. Claim counts/activity refer to the labelled built-in sample, rather than pretending to aggregate real verifications.

## Live mode and backend contract

```dotenv
VITE_API_BASE_URL=http://localhost:8787
VITE_DEMO_MODE=false
```

Restart Vite after changing `.env`. Live mode calls the configured backend and never replaces failed responses with sample findings. Missing configuration, network/timeouts, unavailable endpoints, invalid JSON, malformed responses, and incorrect document/claim IDs are surfaced to the user. Requests time out after 60 seconds. The backend must allow the frontend origin through CORS. Authentication and the backend's own file/content validation belong to the backend developer; no backend functionality is implemented here.

The frontend expects direct JSON bodies matching `src/types/index.ts`, not `{ data: ... }` wrappers. The contract is a proposal for the separately developed backend; adjust only `src/services/api.ts` when its response format is finalized.

| Endpoint                          | Request                                        | Expected response                                       |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health`                 | —                                              | `{ "status": "ok" }` (status string)                    |
| `POST /api/documents`             | multipart `file`, `extractedText`, `pageCount` | `ResearchDocument`                                      |
| `GET /api/documents/:id`          | —                                              | `ResearchDocument`                                      |
| `POST /api/documents/:id/extract` | —                                              | `{ "documentId": ":id" }` after extraction finishes     |
| `GET /api/documents/:id/claims`   | —                                              | `Claim[]`                                               |
| `POST /api/claims/:id/verify`     | —                                              | Updated `Claim` after source lookup/comparison finishes |
| `GET /api/documents/:id/report`   | —                                              | `VerificationReport`                                    |

`ResearchDocument`: `{ id, name, size, pageCount, createdAt, status, mode }`. Dates are parseable ISO timestamps; status is `uploaded`, `processing`, `complete`, or `error`; mode is `live` or `demo`.

`Claim`: `{ id, documentId, text, citation, verdict, confidence, publication, evidence, evidenceReference?, explanation, limitations, humanReview }`. Verdict uses the six exact strings in `src/types/index.ts`. Confidence is a number from 0 to 100 or `null` when not assigned. Publication is `{ title, authors: string[], year?, doi?, url? }` or `null`. Evidence is a passage string or `null`; missing passages and sources are displayed honestly. Unverified claims can use `Needs Human Review`, `confidence: null`, and `evidence: null` until verification finishes. Source links allow absolute HTTP(S) URLs only.

`VerificationReport`: `{ document: ResearchDocument, claims: Claim[], generatedAt, limitations: string[] }`. Every claim must belong to the report's document.

The analysis screen uploads the PDF and locally extracted text, requests extraction, reads claims, verifies each claim, and requests the final report. Searching publications and comparing evidence are represented by the same verify endpoint; live stages do not use artificial delays. This MVP expects endpoints to return completed work. If the backend instead queues jobs, the backend developer should add polling to the API layer once that job contract exists.

The requested API includes no document-list endpoint. Live history therefore contains documents uploaded in this browser session, and live aggregate counters are shown as unavailable. Nothing is fabricated to fill those gaps. Retrying a failed analysis reuses its uploaded document ID, avoiding duplicate uploads. Cancel stops browser requests; backend work already started may continue.

## Limits

- One text-based PDF at a time, up to 25 MB. Extension, MIME type, non-empty size, and PDF header are checked before PDF.js parsing.
- Scanned/image-only PDFs have no OCR. Password-protected or damaged files require an unlocked/readable copy.
- Uploaded content and demo history are in memory. Reloading clears unsent files; live documents remain the backend's responsibility.
- Scores are model indicators, not calibrated probabilities of scientific truth. Human review remains part of the workflow.
- Live verification depends on the separate backend. Real publication retrieval, AI accuracy, real authentication, and store/deployment services are outside this frontend.
- Production hosting must route unknown application paths to `index.html` for React Router, and serve `/pdfjs/` assets and the bundled worker.

## Collaboration

Work is on `feature/frontend`. Install and run this directory independently of the backend. Do not force-push or merge directly into `main`. Lockfile versions are included for reproducible installs.
