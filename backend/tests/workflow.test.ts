import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src";
import { publicationFromRow, Repository } from "../src/database/repository";
import { auth, bindings, syntheticText, upload } from "./helpers";
import {
  syntheticAiRun,
  syntheticExtraction,
  syntheticFetch,
  syntheticPassage,
} from "./fixtures";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("complete API workflow with real local D1/R2 and synthetic external services", () => {
  it("runs upload, extraction, lookup, evidence comparison and a traceable report", async () => {
    const fetch = syntheticFetch(),
      run = syntheticAiRun();
    vi.stubGlobal("fetch", fetch);
    const b = bindings({ AI: { run } as unknown as Ai }),
      doc = await upload(b),
      headers = auth(doc.accessToken);
    const extraction = await app.request(
      `/api/documents/${doc.id}/extract`,
      { method: "POST", headers },
      b,
    );
    expect(extraction.status).toBe(202);
    const job = (await extraction.json()) as { jobId: string };
    const status = await app.request(
      `/api/documents/${doc.id}/jobs/${job.jobId}`,
      { headers },
      b,
    );
    expect(await status.json()).toMatchObject({
      extractionComplete: true,
      status: "waiting",
      progress: 45,
    });
    const claimsResponse = await app.request(
      `/api/documents/${doc.id}/claims`,
      { headers },
      b,
    );
    const claims = (await claimsResponse.json()) as { id: string }[];
    expect(claims).toHaveLength(1);
    const before = await app.request(
      `/api/documents/${doc.id}/report`,
      { headers },
      b,
    );
    expect(await before.json()).toMatchObject({
      status: "processing",
      summary: { unverifiedClaims: 1, needsReviewClaims: 0 },
    });
    expect(
      (await app.request(`/api/claims/${claims[0].id}`, {}, b)).status,
    ).toBe(401);
    const verified = await app.request(
      `/api/claims/${claims[0].id}/verify`,
      { method: "POST", headers },
      b,
    );
    expect(verified.status).toBe(200);
    const claim = (await verified.json()) as {
      verification: {
        verdict: string;
        evidence: { passage: string; sourceUrl: string }[];
      };
    };
    expect(claim).toMatchObject({
      verdict: "Partially Supported",
      confidence: 78,
      evidence: syntheticPassage,
      verification: { verdict: "partially_supported" },
    });
    expect(claim.verification.evidence[0].sourceUrl).toContain("/fullTextXML");
    const reportResponse = await app.request(
      `/api/documents/${doc.id}/report`,
      { headers },
      b,
    );
    const report = (await reportResponse.json()) as Record<string, unknown>;
    expect(report).toMatchObject({
      document: { status: "complete", mode: "live" },
      status: "complete",
      summary: {
        totalClaims: 1,
        verifiedClaims: 1,
        partiallySupportedClaims: 1,
        citationMatchingRate: 1,
      },
    });
    expect(JSON.stringify(report)).not.toMatch(
      /access_token_hash|pdf_key|text_key|accessToken/,
    );
    expect((await new Repository(env.DB).job(doc.id))!).toMatchObject({
      status: "complete",
      progress: 100,
    });
    const calls = run.mock.calls.length;
    expect(
      (
        await app.request(
          `/api/claims/${claims[0].id}/verify`,
          { method: "POST", headers },
          b,
        )
      ).status,
    ).toBe(200);
    expect(run).toHaveBeenCalledTimes(calls);
    const data = await new Repository(env.DB).reportData(doc.id);
    const source = data.sources[0],
      citation = data.citations[0];
    await new Repository(env.DB).resolveCitation(
      citation,
      [{ publication: publicationFromRow(source), score: 0.99 }],
      source.id,
      [],
    );
    expect(
      (await new Repository(env.DB).reportData(doc.id)).evidence,
    ).toHaveLength(data.evidence.length);
  });
  it("keeps missing publications as review findings and protects job ownership", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("synthetic missing publication", { status: 404 }),
        ),
    );
    const run = vi.fn().mockResolvedValue({ response: syntheticExtraction }),
      b = bindings({ AI: { run } as unknown as Ai });
    const doc = await upload(b),
      headers = auth(doc.accessToken);
    const extraction = await app.request(
      `/api/documents/${doc.id}/extract`,
      { method: "POST", headers },
      b,
    );
    const job = (await extraction.json()) as { jobId: string };
    const other = await upload(b);
    expect(
      (
        await app.request(
          `/api/documents/${other.id}/jobs/${job.jobId}`,
          { headers: auth(other.accessToken) },
          b,
        )
      ).status,
    ).toBe(404);
    const claim = (await new Repository(env.DB).reportData(doc.id)).claims[0];
    const verified = await app.request(
      `/api/claims/${claim.id}/verify`,
      { method: "POST", headers },
      b,
    );
    expect(await verified.json()).toMatchObject({
      verdict: "Needs Human Review",
      confidence: null,
      evidence: null,
      verification: { verdict: "needs_review" },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("rejects cross-document database relationships", async () => {
    const b = bindings({
      AI: {
        run: vi.fn().mockResolvedValue({ response: syntheticExtraction }),
      } as unknown as Ai,
    });
    const first = await upload(b),
      second = await upload(b);
    for (const doc of [first, second])
      await app.request(
        `/api/documents/${doc.id}/extract`,
        { method: "POST", headers: auth(doc.accessToken) },
        b,
      );
    const repo = new Repository(env.DB),
      a = await repo.reportData(first.id),
      c = await repo.reportData(second.id);
    await expect(
      repo.saveMappings([
        {
          claim_id: a.claims[0].id,
          citation_id: c.citations[0].id,
          document_id: first.id,
          match_method: "inline",
          match_confidence: 1,
        },
      ]),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare("PRAGMA foreign_keys").first("foreign_keys"),
    ).toBe(1);
    for (const table of [
      "documents",
      "claims",
      "citations",
      "claim_citations",
      "sources",
      "citation_matches",
      "evidence",
      "verifications",
      "analysis_jobs",
    ])
      expect(
        await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
          .bind(table)
          .first("name"),
      ).toBe(table);
  });
  it("continues multiple chunks without letting GET status advance processing", async () => {
    const text = syntheticText.replace(
      "\n\nReferences",
      "\n\n" + "Synthetic context sentence. ".repeat(500) + "\n\nReferences",
    );
    const run = vi.fn(
      async (_model: string, request: { messages: { content: string }[] }) => {
        const chunk = JSON.parse(request.messages[1].content).documentText;
        return {
          response: {
            ...syntheticExtraction,
            claims: chunk.includes(syntheticExtraction.claims[0].text)
              ? syntheticExtraction.claims
              : [],
          },
        };
      },
    );
    const b = bindings({ AI: { run } as unknown as Ai }),
      doc = await upload(b, text),
      headers = auth(doc.accessToken);
    const first = await app.request(
      `/api/documents/${doc.id}/extract`,
      { method: "POST", headers },
      b,
    );
    const job = (await first.json()) as { jobId: string; totalChunks: number };
    expect(job).toMatchObject({
      processedChunks: 1,
      extractionComplete: false,
      continuationRequired: true,
    });
    for (let i = 0; i < 2; i++)
      await app.request(
        `/api/documents/${doc.id}/jobs/${job.jobId}`,
        { headers },
        b,
      );
    expect(run).toHaveBeenCalledTimes(1);
    for (let i = 1; i < job.totalChunks; i++)
      await app.request(
        `/api/documents/${doc.id}/extract`,
        { method: "POST", headers },
        b,
      );
    expect((await new Repository(env.DB).job(doc.id))!).toMatchObject({
      extraction_complete: 1,
      status: "waiting",
      progress: 45,
    });
    expect(
      (await new Repository(env.DB).reportData(doc.id)).claims,
    ).toHaveLength(1);
  });
});
