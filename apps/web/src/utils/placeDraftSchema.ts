import { z } from "zod";

// Validates a place draft's payload before it's saved. Deliberately
// distinct from getPlaceSchema (src/utils/placeSchema.ts) and the
// imperative checks in usePlaceUploadForm's onSubmit, both of which enforce
// "is this complete enough to publish?". This schema only enforces "is
// whatever's present well-typed?" — every field is optional, so a draft
// that's just a name is valid. Mirrors src/utils/eventDraftSchema.ts's
// shape, adapted to usePlaceUploadForm's state.

const openingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  isClosed: z.boolean(),
});

const serviceSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  priceUnit: z.string().optional(),
  showPrice: z.boolean().optional(),
});

const socialLinksSchema = z.record(z.string(), z.string());

export const placeDraftPayloadSchema = z.object({
  name: z.string().max(150).optional(),
  description: z.string().optional(),
  categoryId: z.number().int().optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  websiteUrl: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  socialLinks: socialLinksSchema.optional(),
  openingHours: z.array(openingHourSchema).optional(),
  services: z.array(serviceSchema).optional(),
});

export type PlaceDraftPayload = z.infer<typeof placeDraftPayloadSchema>;
