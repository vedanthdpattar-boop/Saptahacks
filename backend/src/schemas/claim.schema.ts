import { z } from "zod";
export const extractionSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(10).max(2000),
        type: z.enum([
          "factual",
          "scientific",
          "statistical",
          "numerical",
          "conclusion",
        ]),
        page: z.number().int().min(1).max(100).nullable(),
        citationKeys: z.array(z.string().min(1).max(160)).max(15),
        confidence: z.number().min(0).max(1).nullable(),
      }),
    )
    .max(12),
  citations: z
    .array(
      z.object({
        key: z.string().min(1).max(160),
        referenceText: z.string().min(10).max(4000),
      }),
    )
    .max(30),
});
export type Extraction = z.infer<typeof extractionSchema>;
