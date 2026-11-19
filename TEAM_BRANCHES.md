# CiteVerify team branches

The implementation is divided into three component branches based on the published `feature/frontend` commit `6e8856a2d9b643060a184589445eb74a4f49f5ac`. Each implementation file belongs to one branch. This document is shared by all three.

| Branch | Responsibility |
| --- | --- |
| `feature/backend` | Hono routes, private R2 uploads, access tokens, request limits, report DTOs, frontend API integration, Worker/package configuration, shared types, HTTP utilities, API/workflow tests and setup documentation |
| `feature/database` | D1 migration, parameterized repository operations, ownership constraints, indexes and D1 test migration setup |
| `feature/ai` | AI providers/prompts, exact claim extraction, citation parsing/mapping, publication matching, open-access evidence retrieval, conservative verification, AI response schemas and synthetic research/provider tests |

These are components of one application. A component branch alone is incomplete; merge all three before running the full backend. Shared types and configuration live on the backend branch. No stub implementations or copied component files are added to make partial branches appear complete.

## Work on your component

```sh
git fetch origin
git switch --track origin/feature/backend
```

Use `feature/database` or `feature/ai` instead for the other components. If your local branch already exists, use `git switch feature/backend` (or its corresponding name). Commit and push to your own component branch. Coordinate changes to shared types/configuration with the backend owner.

## Assemble and run the application

From a fresh checkout:

```sh
git fetch origin
git switch -c feature/integration origin/feature/frontend
git merge origin/feature/backend origin/feature/database origin/feature/ai
cd backend
npm ci
npm run migrate:local
npm run typecheck
npm run test
npm run build
npm run dev
```

If `feature/integration` already exists, switch to it and merge the current component branches. Keep component branches as the owners of their changes; do not merge the entire integration branch back into each component just to run it.

See `backend/README.md` and `backend/API.md` on the assembled branch for Cloudflare/AI setup and frontend live-mode configuration. Vercel has not been deployed, and live AI/production deployment still require account credentials.

The original complete commit `aee954ba7fcf55bfb1faff02fdf519d62354a049` is preserved locally as `backup/citeverify-complete`. The local integration branch retains the assembled application. Main and the frontend branch are unchanged.
