import { z } from "zod";

// Discovery inputs shared by the web Server Actions and the /api/mobile
// routes. Query strings arrive as strings on GET, so numbers and booleans
// are coerced; everything is bounded so a request cannot ask for more than
// the database would give anyway.

const uuid = z.string().uuid("Invalid id");

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().finite().min(min).max(max).optional(),
  );

const optionalBoolean = z.preprocess(
  (v) =>
    v === "" || v === null || v === undefined
      ? undefined
      : v === true || v === "true" || v === "1",
  z.boolean().optional(),
);

const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z
    .string()
    .max(40)
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
    .optional(),
);

const stringList = z.preprocess(
  (v) =>
    v === null || v === ""
      ? undefined
      : typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
  z.array(z.string().min(1).max(80)).max(20).optional(),
);

export const searchRequestSchema = z.object({
  q: z.string().max(200).default(""),
  mode: z.enum(["all", "events", "places", "organizers"]).default("all"),
  cursor: z.string().max(400).optional().nullable(),
  pageSize: optionalNumber(1, 50),
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
  radiusKm: optionalNumber(1, 500),
  category: z.string().max(80).optional().nullable(),
  types: stringList,
  minPrice: optionalNumber(0, 1_000_000),
  maxPrice: optionalNumber(0, 1_000_000),
  startDate: optionalDate,
  endDate: optionalDate,
  minRating: optionalNumber(0, 5),
  placeCategoryId: optionalNumber(1, 32767),
  openNow: optionalBoolean,
  organizerId: uuid.optional().nullable(),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;

export const searchSuggestSchema = z.object({
  q: z.string().max(200).default(""),
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
});

export const searchClickSchema = z.object({
  searchId: z.coerce.number().int().positive(),
  entityType: z.enum(["event", "place", "organizer"]),
  entityId: uuid,
  rank: z.coerce.number().int().min(0).max(1000),
});

export const notificationPreferencesPatchSchema = z
  .object({
    recommendationsPush: z.boolean().optional(),
    organizerAlertsPush: z.boolean().optional(),
    placeUpdatesPush: z.boolean().optional(),
    socialPush: z.boolean().optional(),
    rewardEmails: z.boolean().optional(),
    pause: z.enum(["two_weeks", "resume"]).optional(),
  })
  .strict();

export const subscriptionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organizer"), organizerId: uuid }),
  z.object({ kind: z.literal("place"), placeId: uuid }),
  z.object({ kind: z.literal("similar_events"), eventId: uuid }),
  z.object({ kind: z.literal("similar_places"), placeId: uuid }),
]);

export const subscribeSchema = z.object({
  target: subscriptionTargetSchema,
  source: z.enum(["profile", "search", "settings"]).default("profile"),
});

export const subscriptionStatusSchema = z.object({
  kind: z.enum(["organizer", "place"]),
  targetId: uuid,
});

export const unsubscribeSchema = z.object({ subscriptionId: uuid });

export const promptContextSchema = z.discriminatedUnion("context", [
  z.object({ context: z.literal("purchase"), eventId: uuid }),
  z.object({ context: z.literal("rsvp"), eventId: uuid }),
  z.object({
    context: z.literal("place"),
    placeId: uuid,
    trigger: z.enum(["favorite", "review", "visit"]),
  }),
]);

export const promptResponseSchema = z.object({
  context: promptContextSchema,
  response: z.enum(["accepted", "dismissed"]),
  accept: z
    .object({
      similarEvents: z.boolean().optional(),
      organizer: z.boolean().optional(),
      place: z.boolean().optional(),
    })
    .optional(),
});

export const recommendationSubjectSchema = z.object({
  subjectType: z.enum(["event", "place"]),
  subjectId: uuid,
});
