import { z } from "zod";
import { eventVenueSchema } from "./showRunSchemas";

// Moving an event that already has tickets
// (docs/architecture/event-reschedule.md): the shapes both transports
// accept. Who asks is proved by the transport; the rules live in
// @abonten/core/eventReschedule and event_reschedule().

export const rescheduleEventSchema = z.object({
  eventId: z.string().uuid(),
  /** "Postponed, new date to come" (single-date events, no date or venue). */
  postpone: z.boolean().optional(),
  /** One date of an event with several dates. */
  occurrenceId: z.string().uuid().nullish(),
  /** An instant, or a wall-clock time in the venue's zone. */
  startsAt: z.string().min(1).max(40).nullish(),
  endsAt: z.string().min(1).max(40).nullish(),
  /** A new venue in the same country. */
  venue: eventVenueSchema.nullish(),
  message: z.string().max(2000),
});
export type RescheduleEventSchemaInput = z.infer<typeof rescheduleEventSchema>;

export const rescheduleEventIdSchema = z.object({
  eventId: z.string().uuid(),
});
