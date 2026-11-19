import { z } from "zod";
export const verificationSchema = z.object({
  verdict: z.enum([
    "supported",
    "partially_supported",
    "unsupported",
    "contradictory",
    "possibly_outdated",
    "needs_review",
  ]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(20).max(3000),
  evidence: z
    .array(
      z.object({
        passage: z.string().min(15).max(3000),
        sourceId: z.string().min(1),
        location: z.string().min(1).max(300),
        relation: z.enum([
          "supports",
          "partially_supports",
          "does_not_support",
          "contradicts",
          "context",
        ]),
      }),
    )
    .max(8),
  limitations: z.array(z.string().min(1).max(500)).max(20),
  requiresHumanReview: z.boolean(),
});
export type VerificationOutput = z.infer<typeof verificationSchema>;
