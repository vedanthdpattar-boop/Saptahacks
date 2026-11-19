import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiProvider, structuredOutput } from "../src/ai/ai.provider";
import { bindings } from "./helpers";
afterEach(() => vi.unstubAllGlobals());
describe("AI provider configuration and structured responses", () => {
  it("sends Workers AI JSON Schema and returns validated output", async () => {
    const run = vi.fn().mockResolvedValue({ response: { value: "synthetic" } });
    const result = await structuredOutput(
      aiProvider(bindings({ AI: { run } as unknown as Ai })),
      "Synthetic test instructions",
      {},
      z.object({ value: z.string() }),
    );
    expect(result).toEqual({ value: "synthetic" });
    expect(run.mock.calls[0][1]).toMatchObject({
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { type: "object" } },
    });
  });
  it("uses Gemini's configured model and secret header without exposing provider errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: '{"value":"synthetic"}' }] },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const provider = aiProvider(
      bindings({
        AI_PROVIDER: "gemini",
        AI_MODEL: "gemini-3.8-flash",
        GEMINI_API_KEY: "synthetic-secret",
      }),
    );
    expect(
      await structuredOutput(
        provider,
        "Synthetic test instructions",
        {},
        z.object({ value: z.string() }),
      ),
    ).toEqual({ value: "synthetic" });
    expect(fetch.mock.calls[0][0]).toContain(
      "gemini-3.8-flash:generateContent",
    );
    expect(fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe(
      "synthetic-secret",
    );
    expect(
      JSON.parse(fetch.mock.calls[0][1].body).generationConfig,
    ).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
    });
  });
  it("fails clearly for missing Gemini secrets, invalid selection and unavailable Workers AI", async () => {
    await expect(
      aiProvider(bindings({ AI_PROVIDER: "gemini" })).generate(
        "Synthetic",
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "gemini_key_missing" });
    expect(() => aiProvider(bindings({ AI_PROVIDER: "unknown" }))).toThrow(
      "AI_PROVIDER",
    );
    const run = vi
      .fn()
      .mockRejectedValue(new Error("synthetic private upstream error"));
    await expect(
      aiProvider(bindings({ AI: { run } as unknown as Ai })).generate(
        "Synthetic",
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });
});
