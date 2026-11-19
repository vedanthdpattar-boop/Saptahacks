import { z } from "zod";
import type { Bindings } from "../types";
import { ApiError } from "../middleware/error.middleware";
import type { AiProvider } from "./ai.provider";
import { fetchBounded } from "../services/http.service";
const geminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
              thought: z.boolean().optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});
export class GeminiProvider implements AiProvider {
  readonly model: string;
  constructor(private env: Bindings) {
    this.model = env.AI_MODEL ?? "gemini-3.8-flash";
  }
  async generate(
    system: string,
    input: unknown,
    schema: Record<string, unknown>,
  ) {
    if (!this.env.GEMINI_API_KEY)
      throw new ApiError(
        503,
        "gemini_key_missing",
        "Configure the GEMINI_API_KEY secret before using the Gemini provider.",
      );
    if (!/^gemini-[a-z0-9._-]{1,99}$/.test(this.model))
      throw new ApiError(
        503,
        "invalid_ai_model",
        "Configure a supported Gemini model ID in AI_MODEL.",
      );
    try {
      const response = await fetchBounded(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [
              { role: "user", parts: [{ text: JSON.stringify(input) }] },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseJsonSchema: schema,
            },
          }),
        },
        ["generativelanguage.googleapis.com"],
        20000,
        100000,
      );
      const parsed = geminiResponse.safeParse(JSON.parse(response.text));
      if (!parsed.success || parsed.data.candidates[0].finishReason !== "STOP")
        return undefined;
      return parsed.data.candidates[0].content.parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
    } catch (error) {
      if (error instanceof ApiError && error.code === "external_too_large")
        return undefined;
      throw new ApiError(
        503,
        "gemini_unavailable",
        "Gemini could not generate a response. Check the secret, model availability and account limits.",
      );
    }
  }
}
