import { z } from "zod";
import { ApiError } from "../middleware/error.middleware";
import type { Bindings } from "../types";
import { WorkersAiProvider } from "./workers-ai.provider";
import { GeminiProvider } from "./gemini.provider";

export interface AiProvider {
  readonly model: string;
  generate(
    system: string,
    input: unknown,
    schema: Record<string, unknown>,
  ): Promise<unknown>;
}
export function aiProvider(env: Bindings): AiProvider {
  if ((env.AI_PROVIDER ?? "workers-ai") === "workers-ai")
    return new WorkersAiProvider(env);
  if (env.AI_PROVIDER === "gemini") return new GeminiProvider(env);
  throw new ApiError(
    503,
    "invalid_ai_provider",
    "Set AI_PROVIDER to workers-ai or gemini.",
  );
}
export async function structuredOutput<T>(
  provider: AiProvider,
  system: string,
  input: unknown,
  schema: z.ZodType<T>,
  validate?: (value: T) => void,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.generate(
      system +
        (attempt
          ? "\nThe previous response failed validation. Return valid JSON and exact input quotations only."
          : ""),
      input,
      jsonSchema,
    );
    try {
      const value = schema.parse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
      validate?.(value);
      return value;
    } catch {
      if (attempt)
        throw new ApiError(
          502,
          "invalid_ai_output",
          "The AI response failed JSON or evidence validation twice. Retry processing; no invalid findings were saved.",
        );
    }
  }
  throw new Error("unreachable");
}
export async function aiTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ApiError(
                503,
                "ai_timeout",
                "The AI service exceeded its 20-second response limit. Retry this stage.",
              ),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
