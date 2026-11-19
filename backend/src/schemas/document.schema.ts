import { z } from "zod";
import type { Bindings } from "../types";

export const documentFields = z.object({
  extractedText: z.string().min(40),
  pageCount: z.coerce.number().int().min(1).max(100),
});
export function uploadLimits(env: Bindings) {
  return {
    pdf: z.coerce
      .number()
      .int()
      .min(1024)
      .max(25 * 1024 * 1024)
      .parse(env.MAX_PDF_BYTES ?? 10 * 1024 * 1024),
    text: z.coerce
      .number()
      .int()
      .min(1000)
      .max(500000)
      .parse(env.MAX_TEXT_BYTES ?? 200000),
  };
}
