import { z } from "zod";

// Draft-safe: every field but the review target is optional, so "just a
// rating, no text yet" is a valid save. Compare to ReviewModal's own
// publish-time schema (title/review required) — that stays unchanged.
export const reviewDraftPayloadSchema = z.object({
  reviewedId: z.string().uuid(),
  title: z.string().max(150).optional(),
  comment: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export type ReviewDraftPayload = z.infer<typeof reviewDraftPayloadSchema>;
