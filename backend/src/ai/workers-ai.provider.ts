import type { Bindings } from "../types";
import { ApiError } from "../middleware/error.middleware";
import { aiTimeout, type AiProvider } from "./ai.provider";
export class WorkersAiProvider implements AiProvider {
  readonly model: string;
  constructor(private env: Bindings) {
    this.model = env.AI_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  }
  async generate(
    system: string,
    input: unknown,
    schema: Record<string, unknown>,
  ) {
    if (!this.env.AI)
      throw new ApiError(
        503,
        "ai_unavailable",
        "The Workers AI binding is unavailable. Configure Cloudflare credentials or the Gemini provider.",
      );
    try {
      const result = await aiTimeout(
        this.env.AI.run(this.model as keyof AiModels, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(input) },
          ],
          max_tokens: 4096,
          temperature: 0,
          response_format: { type: "json_schema", json_schema: schema },
        }),
      );
      if (!result || typeof result !== "object" || !("response" in result))
        return undefined;
      return result.response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "ai_unavailable",
        "Workers AI could not generate a response. Check authentication, model JSON Mode support and account limits.",
      );
    }
  }
}
