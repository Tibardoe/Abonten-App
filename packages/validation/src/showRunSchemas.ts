import { z } from "zod";

// Runs of shows and copying a listing (docs/architecture/show-runs.md): the
// shapes the transports accept. The rules (dates ahead, at most 60 shows,
// a valid weekly pattern) are @abonten/core/showRuns', checked by the
// service with messages in the person's language.

/** Another venue: an Abonten place, or an address with its point. */
export const eventVenueSchema = z
  .object({
    placeId: z.string().uuid().nullish(),
    address: z.string().max(500).nullish(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
  })
  .refine(
    (v) =>
      !!v.placeId ||
      (!!v.address?.trim() && v.latitude != null && v.longitude != null),
  );

const slot = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z.string().max(5),
});

export const addEventShowsSchema = z
  .object({
    eventId: z.string().uuid(),
    rule: z
      .object({
        fromDate: z.string().max(10),
        untilDate: z.string().max(10),
        slots: z.array(slot).max(50),
        durationMinutes: z.number().int(),
      })
      .nullish(),
    shows: z
      .array(
        z.object({ startsAt: z.string().max(40), endsAt: z.string().max(40) }),
      )
      .max(100)
      .nullish(),
    separate: z.boolean().optional(),
    // Another venue (a tour).
    venue: eventVenueSchema.nullish(),
    clientRequestId: z.string().uuid(),
  })
  .refine((v) => !!v.rule !== !!(v.shows && v.shows.length > 0), {
    path: ["rule"],
  });
export type AddEventShowsSchemaInput = z.infer<typeof addEventShowsSchema>;

/** The account's other runs that could join this listing's run. */
export const joinableRunsSchema = z.object({ eventId: z.string().uuid() });

/** Brings another listing (with every show of its run) into this run. */
export const joinEventRunsSchema = z.object({
  eventId: z.string().uuid(),
  otherEventId: z.string().uuid(),
});
export type JoinEventRunsSchemaInput = z.infer<typeof joinEventRunsSchema>;
