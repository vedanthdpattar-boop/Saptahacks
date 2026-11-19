# CiteVerify backend

The Hono Worker stores uploaded PDFs and extracted text privately in Cloudflare KV (or an optional R2 binding), keeps document-scoped claims and verification records in D1, resolves citations with Crossref and OpenAlex, retrieves identifiable open-access full text, and compares exact quotations with Workers AI or Gemini. The existing React frontend connects through its API service; it includes independent bibliography checking and an APA/IEEE DOI generator.

## Current readiness

The results below apply to the assembled application. Merge the three component branches as described in [TEAM_BRANCHES.md](../TEAM_BRANCHES.md) before running the backend.

The website is deployed at https://error404-beryl-eight.vercel.app, and Vercel production tracks `feature/integration`. Its exact origin is configured for authenticated CORS. D1 has been created and migrated, and the confirmed Crossref contact is configured.

The deployment uses private Workers KV because R2 activation requires a payment method. PDFs retain the 10 MiB limit, extracted text retains the 200000-byte limit, and access-token checks are unchanged. The API was uploaded to https://citeverify-api.citeverify-backend.workers.dev. Public HTTPS and health checks passed with exact-origin CORS; an unconfigured origin returned 403. A published Europe PMC research excerpt completed upload, real Workers AI extraction, citation/publication lookup, evidence comparison and report generation through the deployed website. One claim was marked supported with traceable evidence. An unauthenticated document request returned 401. This is a workflow smoke test, not a scientific accuracy benchmark.

Validation on 2026-11-20: TypeScript and all 51 Workers-runtime backend tests passed. These include a 10 MiB binary PDF round trip through KV, failure cleanup, a retryable delayed KV read, the complete synthetic API workflow with both KV and R2, and regression checks for wrapped PDF quotations, reference markers and bibliography exclusion. The frontend passed 11 API tests and its production build; all six browser checks passed during deployment preparation. Synthetic AI tests do not establish real scientific accuracy.

## Architecture

- `src/index.ts`, `routes/`: Hono endpoints, CORS and request limits.
- `services/document.service.ts`: PDF validation, private KV/R2 storage, access-token issuance and failure cleanup.
- `services/claim.service.ts`, `citation.service.ts`: bounded exact-text extraction, deterministic citation parsing, AI assistance and document jobs.
- `services/research.service.ts`: DOI/bibliographic lookups, title/author/year matching, alternative matches and D1 metadata caching.
- `services/evidence.service.ts`: source-identity checks, Europe PMC JATS, supported repository HTML/XML/text, paragraph selection and retrieval provenance.
- `services/verification.service.ts`: validated AI comparison, exact quotation checks and conservative missing-evidence/numerical rules.
- `services/report.service.ts`: legacy frontend DTOs plus complete citation, source, evidence and summary metadata.
- `database/repository.ts`: parameterized D1 operations. `migrations/0001_initial.sql` defines nine tables, foreign keys and indexes.
- `ai/`: structured-output providers and prompts. Retrieved content is data, never model instructions.
- `middleware/`: SHA-256 token verification, native Workers rate limiting and public error responses.

## Prerequisites and installation

Use Node.js 22.12 or newer; this implementation was checked with Node 24. Wrangler and the Workers Vitest plugin are local dependencies, so a global CLI is unnecessary.

From the repository:

```sh
git fetch origin
git switch --track origin/feature/integration
cd backend
npm ci
npm run migrate:local
npm run dev
```

The Worker listens at `http://localhost:8787`. Local D1 and KV/R2 data stays in the ignored `.wrangler/` directory. Health checks use D1 and do not prove that remote AI or research providers are ready:

```sh
curl http://localhost:8787/api/health
```

## Environment configuration

Non-secret defaults live in `wrangler.jsonc`:

| Setting                  | Default / purpose                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `AI_PROVIDER`            | `workers-ai`; alternatively `gemini`                                                 |
| `AI_MODEL`               | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for Workers AI                            |
| `FRONTEND_ORIGIN`        | Production Vercel origin plus exact localhost/127.0.0.1 origins; comma-separated            |
| `CROSSREF_CONTACT_EMAIL` | Confirmed team contact; use your own contact when deploying a separate instance |
| `MAX_PDF_BYTES`          | `10485760` (10 MiB); validated up to 25 MiB                                          |
| `MAX_TEXT_BYTES`         | `200000` UTF-8 bytes; validated up to 500000                                         |

For local overrides, copy the placeholder example and replace every uncommented placeholder:

```sh
cp .env.example .dev.vars
```

Use real settings, such as the model/origin/size defaults above. Keep `.dev.vars` ignored. Wrangler also reads `.env` files, but use one approach consistently. Secrets are never frontend variables and must never be committed.

For optional Gemini inference, put these values in `.dev.vars`:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-3.8-flash
GEMINI_API_KEY=YOUR_ACTUAL_SECRET
```

For deployed Gemini, update `AI_PROVIDER` and `AI_MODEL` in `wrangler.jsonc`, then enter the key interactively:

```sh
npx wrangler secret put GEMINI_API_KEY
```

Workers AI is the primary provider. The selected Llama model currently supports JSON Mode. Local Workers AI inference uses Cloudflare's service and requires authentication; it is not an offline model. After logging in, set `remote: true` in the `ai` binding for remote AI development and restart Wrangler. With no credentials, the local server still supports D1/KV/health/upload and returns an explicit AI processing error. Gemini can be used for local inference instead when its secret is configured. Both providers have a 20-second per-generation timeout; invalid JSON or untraceable quotations receive one controlled retry and then an actionable processing error. There is no automatic switch to demo results or another provider.

OpenAlex works without a key for basic access; configure the optional key for the account's larger budget:

```sh
npx wrangler secret put OPENALEX_API_KEY
```

Use `OPENALEX_API_KEY=YOUR_ACTUAL_SECRET` in the ignored `.dev.vars` for local use. Crossref uses the configured contact in both its descriptive User-Agent and `mailto` query parameter.

## Create Cloudflare resources and deploy

These commands have to run in your authenticated account:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create citeverify-db
npx wrangler kv namespace create citeverify-files
```

Copy the actual UUID printed by D1 creation into the first `d1_databases` entry in `wrangler.jsonc` as `database_id`. Keep `binding: "DB"`, `database_name: "citeverify-db"`, the local preview name, and the migrations directory. Do not substitute an invented UUID. If the database or namespace already exists, use it rather than creating a duplicate:

```sh
npx wrangler d1 list
npx wrangler kv namespace list
```

Bindings are `DB`, `FILES_KV` and `AI`. Copy the actual KV namespace ID into `kv_namespaces` as `binding: "FILES_KV"`. No public KV gateway is exposed. Keep uploads private and document-token protected.

KV's free allowance includes 1 GB stored, 100000 reads/day and 1000 writes/day; each successful upload uses two writes. New keys can take time to become readable in another region. A missing KV text read returns 503 and releases the processing lease so the user can retry in a minute. Quota failures return an error and do not substitute findings. Monitor storage use and delete obsolete documents through an authorized maintenance process before reaching the allowance.

Optional R2: create a private `citeverify-files` bucket, remove the KV binding and add `r2_buckets: [{ "binding": "FILES", "bucket_name": "citeverify-files" }]`. Do not switch an existing deployment's storage without migrating its documents; previously uploaded files remain in their original storage. Never enable a public R2 URL for research documents. Native rate-limit bindings are also configured. Their namespace IDs are account-scoped user choices; choose different numeric IDs if the account already uses `1001` or `1002` for another application.

Set the actual `CROSSREF_CONTACT_EMAIL`. Once Vercel is deployed, append its exact origin (for example your real `https://…vercel.app` origin) to `FRONTEND_ORIGIN`, without path or trailing slash. Keep localhost entries while teammates use local frontends. Wildcard authenticated CORS is rejected.

Then run:

```sh
npm run typecheck
npm run test
npm run build
npx wrangler d1 migrations apply citeverify-db --remote
npm run deploy
```

`npm run deploy` validates the real database ID/contact/CORS before invoking `wrangler deploy`. After those checks, the equivalent direct command is:

```sh
npx wrangler deploy
```

Use the Worker URL actually returned by Wrangler. Deployment does not deploy the Vercel frontend. Remote account access, KV/AI availability and plan limits must be checked in your account; a dry run does not create resources or prove a live deployment.

## Connect the existing frontend

From the repository, create or edit the ignored `frontend/.env` with:

```dotenv
VITE_API_BASE_URL=http://localhost:8787
VITE_DEMO_MODE=false
```

Use the actual deployed Worker origin instead of localhost when it is available. Restart Vite after environment changes:

```sh
cd frontend
npm ci
npm run dev
```

For the existing labelled demonstration, explicitly use `VITE_DEMO_MODE=true`. Live failures stay failures. The API service stores each returned access token in `sessionStorage`, sends it as a Bearer header, polls extraction status, continues bounded chunks through POST requests, and then uses the existing page's per-claim verification loop. It handles lease conflicts, cancellation and backend error messages. Each request has a 120-second browser timeout to accommodate bounded research lookup plus the controlled AI retry.

Token storage is per browser session. A report link by itself does not grant access from another session; upload again there or arrange token transfer privately using an API client. There is no account management or token recovery endpoint. Never put a token in a URL or source control.

The PDF.js frontend accepts PDFs up to 10 MiB, matching the API limit. Scanned/image-only PDFs require OCR before this workflow; the backend does not parse arbitrary PDFs server-side.

## Jobs, limits and evidence rules

An extraction POST processes one overlapping text chunk, at most 8000 characters. Prompts preserve exact contiguous original wording. When AI normalizes PDF whitespace, extraction restores the actual contiguous source substring; changed words, numbers and punctuation remain invalid. Printed reference markers are recovered only from the matching deterministic reference block. Bibliography-only claims are removed. Claim/reference strings that cannot be grounded in the input are rejected before persistence. There are at most 40 chunks, 100 claims, 150 references and 100 pages per document. Exceeding processing limits causes a visible error and does not silently declare a partial extraction complete.

`analysis_jobs` tracks the entire analysis. Extraction ending sets `extractionComplete: true`, stage `awaiting_verification`, status `waiting` and progress 45; it does not mark the entire job complete. Every claim verification saves a result and advances progress. The final traceable report is assembled before the job reaches 100. GET job status is read-only. Browser cancellation stops requests; saved progress remains. Document leases serialize mutations and expire after two minutes so interrupted processing can resume.

PDF.js currently supplies plain text and total pages, without per-claim physical page boundaries. Guessed model pages are discarded. If text contains form-feed page boundaries matching `pageCount`, those supplied boundaries are used; otherwise claim pages stay `null`.

Publication matching checks DOI, title, authors and year and requires a sufficient margin between distinct candidates. A valid DOI pointing to conflicting metadata is not blindly accepted. Alternative matches and diagnostic notes are retained. Publication metadata is cached in D1 for a day and per-citation resolutions for an hour; saved verification calls are idempotent. This MVP does not automatically refresh previously verified claims.

Two cited publications per claim are processed to bound execution. Supported full-text hosts are Europe PMC/EBI, PMC, arXiv, PLOS and eLife. Europe PMC open-access JATS is the primary path; identifiable repository JATS, supported scholarly HTML body paragraphs and explicitly identified plain text are also supported. Source DOI/title identity is checked before accepting full text. HTTPS host/port/redirect checks, eight-second external fetch timeouts and response limits prevent arbitrary URL retrieval. Other repository hosts, linked PDFs, tables, figures and supplementary files need human review or a later dedicated parser. Paywalls are never bypassed.

Passages are selected with surrounding paragraph context, within an 18000-character per-source budget. Every quotation must be an exact substring of a retrieved full-text passage with the actual supplied source and location. Numerical absence cannot produce full support or, alone, a contradiction. Publication age alone cannot produce outdatedness. An abstract is explicitly labelled `abstract`, never used to establish a detailed full-text verdict. Missing publications, abstract-only evidence and unavailable relevant full text produce `needs_review` with `confidence: null`.

Confidence represents uncalibrated evidence strength. Reports have counts, claim-citation mapping and citation-publication matching rates, with their denominators; they do not expose a universal integrity score. The rich `verification` object uses snake-case verdicts and confidence 0–1. Legacy display fields retain the frontend's labels and 0–100 confidence.

Native Workers rate limits are approximate per Cloudflare location: API requests 120/minute per connecting IP, research requests 20/10 seconds per provider category. There are no per-process counters. External 429/timeouts are retained as limitations or processing errors as appropriate. KV/R2/D1 upload failure triggers object cleanup; if cleanup itself fails, the server logs a safe cleanup failure code for operational follow-up.

## API and testing

See [API.md](API.md) for all endpoints and request/response examples. All protected calls require the document's Bearer token, including claim and report routes. Storage keys, token hashes and credentials are never included in responses. SQL is parameterized; composite foreign keys prevent cross-document claim-citation mappings and unrelated evidence attachments.

```sh
cd backend
npm run typecheck
npm run test
npm run build
npm run migrate:local
cd ../frontend
npm run test
npm run build
npm run test:e2e
```

Backend tests execute in Cloudflare's Workers runtime with real local D1/KV/R2 and mocked external APIs/AI. Every fixture is explicitly synthetic. Coverage includes upload/auth/cleanup, schema relationships, malformed/exact AI output, citation parsing, DOI and ambiguous matching, source identity, full-text and abstract handling, numerical exaggeration, contradictions, report traceability and idempotency. The required synthetic 30% scenario is tested directly and through the complete endpoint workflow. Frontend tests cover session tokens, multipart fields, job continuation, cancellation, conflicts and no live-to-demo fallback.

## Team Git workflow

Work is split between `feature/backend`, `feature/database` and `feature/ai`, sharing the published frontend base. See [TEAM_BRANCHES.md](../TEAM_BRANCHES.md) for file ownership and assembly commands. The component branches depend on one another; run the complete application after merging all three into `feature/integration`. Main and the frontend branch are preserved.

The initial split commits already exist. Publish the three branches when Git authentication is configured:

```sh
git push -u origin feature/backend feature/database feature/ai
```

Make future commits on the branch that owns the files. Do not commit dependencies, build output, `.dev.vars`, credentials or local D1/R2 state. The original complete implementation is retained locally on `backup/citeverify-complete`.

## Official references checked

- [Cloudflare Workers Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Workers native rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) and [selected Llama model](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [GenerateContent API](https://ai.google.dev/api/generate-content) and [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash)
- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [OpenAlex API](https://help.openalex.org/api/)
- [Europe PMC REST API](https://www.ebi.ac.uk/europepmc/webservices/rest/) and [Europe PMC web service guide](https://europepmc.org/RestfulWebService)


## Citation studio

The frontend offers both bibliography metadata checks and citation generation. All extracted references remain reviewable even when no scientific claims were found. Checks display printed details beside registry metadata, alternatives and title/year differences. They do not label metadata matching as claim support. The generator uses Crossref metadata and the DOI Foundation formatting service for APA 7 and IEEE, with copy and plain-text download. See [API.md](API.md) for routes, privacy and provider limits.

The source illustration uses CSS rotation/opacity, a pause control and reduced-motion support. Scientific results remain stationary. The design uses existing components and dependencies; no animation library was added.
