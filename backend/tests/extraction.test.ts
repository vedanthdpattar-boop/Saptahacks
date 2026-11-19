import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractClaims,
  processExtraction,
  splitDocumentText,
} from "../src/services/claim.service";
import {
  canonicalCitationKey,
  citationMarkers,
  claimCitationKeys,
  normalizeDoi,
  parseReferences,
} from "../src/services/citation.service";
import { Repository } from "../src/database/repository";
import type { AiProvider } from "../src/ai/ai.provider";
import { bindings, syntheticText, upload } from "./helpers";
import { syntheticExtraction } from "./fixtures";
afterEach(() => vi.restoreAllMocks());
describe("exact extraction and citation association", () => {
  it("normalizes common keys, groups, narrative references and DOI punctuation", () => {
    expect(
      citationMarkers(
        "One [1, 2] and (Smith, 2023) or (Smith et al., 2023) and Smith et al. (2023).",
      ).map((m) => m.key),
    ).toEqual(["[1]", "[2]", "smith:2023", "smith:2023", "smith:2023"]);
    expect(citationMarkers("Sources [3–5].").map((m) => m.key)).toEqual([
      "[3]",
      "[4]",
      "[5]",
    ]);
    expect(canonicalCitationKey("(Smith et al., 2023)")).toBe("smith:2023");
    expect(normalizeDoi("https://doi.org/10.9999/TEST).")).toBe("10.9999/test");
    expect(normalizeDoi("not-a-doi")).toBeNull();
    const parsed = parseReferences("synthetic", syntheticText);
    expect(parsed.citations[0]).toMatchObject({
      citation_key: "[1]",
      doi: "10.9999/synthetic-pilot",
      title: "Learning application pilot outcomes",
      publication_year: 2023,
    });
    const duplicates = parseReferences(
      "synthetic",
      syntheticText +
        "\n[2] Smith, A. (2023). Learning application pilot outcomes. doi:10.9999/synthetic-pilot",
    );
    expect(
      duplicates.diagnostics.some((n) => n.includes("Duplicate publication")),
    ).toBe(true);
  });
  it("does not assume an unrelated closest citation supports a claim", () => {
    const text = "The sample improved. Another unrelated statement [2].";
    expect(
      claimCitationKeys(text, "The sample improved.", ["[2]"]).get("[2]")
        ?.method,
    ).toBe("ai_assisted");
    expect(claimCitationKeys(text, "The sample improved.").size).toBe(0);
    expect(
      claimCitationKeys("The sample improved. [1]", "The sample improved.").get(
        "[1]",
      )?.method,
    ).toBe("adjacent");
    expect(
      claimCitationKeys(text, "The sample improved.", ["[999]"]).size,
    ).toBe(0);
  });
  it("bounds prompts and assigns pages only from supplied form-feed boundaries", () => {
    const chunks = splitDocumentText("x".repeat(20000), 7);
    expect(chunks.every((c) => c.text.length <= 8000 && c.page === null)).toBe(
      true,
    );
    expect(chunks.map((c) => c.text).join("")).toContain("x".repeat(20000));
    expect(splitDocumentText("first\fsecond", 2).map((c) => c.page)).toEqual([
      1, 2,
    ]);
    expect(splitDocumentText("first\fsecond", 3).map((c) => c.page)).toEqual([
      null,
    ]);
  });
  it("retries malformed and invented output once, then fails without saving it", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("{broken")
      .mockResolvedValueOnce(syntheticExtraction);
    const provider: AiProvider = { model: "synthetic-model", generate };
    expect(
      (await extractClaims({ text: syntheticText, page: null }, provider))
        .claims,
    ).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(2);
    generate
      .mockReset()
      .mockResolvedValue({
        ...syntheticExtraction,
        claims: [
          {
            ...syntheticExtraction.claims[0],
            text: "Invented claim about a synthetic result.",
          },
        ],
      });
    await expect(
      extractClaims({ text: syntheticText, page: null }, provider),
    ).rejects.toMatchObject({ code: "invalid_ai_output" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("persists mappings and rejects model-guessed pages; repeated extraction is idempotent", async () => {
    const run = vi.fn().mockResolvedValue({ response: syntheticExtraction });
    const b = bindings({ AI: { run } as unknown as Ai });
    const doc = await upload(b);
    const repo = new Repository(env.DB);
    const row = (await repo.document(doc.id))!;
    const job = await processExtraction(b, row);
    expect(job).toMatchObject({
      extractionComplete: true,
      status: "waiting",
      currentStage: "awaiting_verification",
      progress: 45,
    });
    const data = await repo.reportData(doc.id);
    expect(data.claims).toHaveLength(1);
    expect(data.claims[0].page_number).toBeNull();
    expect(data.mappings[0]).toMatchObject({
      claim_id: data.claims[0].id,
      citation_id: data.citations[0].id,
      match_method: "inline",
    });
    await processExtraction(b, row);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await repo.document(doc.id))!.status).toBe("processing");
  });
  it("stores an actionable job error for malformed AI and resumes after retry", async () => {
    const run = vi.fn().mockResolvedValue({ response: "bad JSON" });
    const b = bindings({ AI: { run } as unknown as Ai });
    const doc = await upload(b),
      repo = new Repository(env.DB),
      row = (await repo.document(doc.id))!;
    await expect(processExtraction(b, row)).rejects.toMatchObject({
      code: "invalid_ai_output",
    });
    expect((await repo.reportData(doc.id)).claims).toHaveLength(0);
    expect((await repo.job(doc.id))!.status).toBe("error");
    run.mockResolvedValue({ response: syntheticExtraction });
    expect(
      (await processExtraction(b, (await repo.document(doc.id))!))
        .extractionComplete,
    ).toBe(true);
  });
});
