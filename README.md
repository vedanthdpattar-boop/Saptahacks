# CiteVerify AI

Check citations in uploaded research PDFs, trace claims to retrieved evidence, and generate APA 7 or IEEE references from a DOI.

- [Live website](https://error404-beryl-eight.vercel.app)
- [API and setup](backend/README.md)
- [API reference](backend/API.md)
- [Team branch ownership](TEAM_BRANCHES.md)

Production follows `feature/integration`. Frontend, backend, database and AI component branches remain available for team development. The website runs on Vercel; the API uses Cloudflare Workers, D1, private KV and Workers AI.

Citation metadata matching and citation formatting do not establish that a publication supports a claim. Review the linked sources before relying on results. The DOI generator currently requires a Crossref-indexed publication.
