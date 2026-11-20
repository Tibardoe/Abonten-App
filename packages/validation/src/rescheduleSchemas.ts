import { z } from "zod";

// Moving an event that already has tickets
// (docs/architecture/event-reschedule.md): the shapes both transports
// accept. Who asks is proved by the transport; the rules live in
// @abonten/core/eventReschedule and event_reschedule().

export const rescheduleEventSchema = z.object({
  eventId: z.string().uuid(),
  /** An instant, or a wall-clock time in the event's zone. */
  startsAt: z.string().min(1).max(40),
  endsAt: z.string().min(1).max(40),
  message: z.string().max(2000),
});
export type RescheduleEventSchemaInput = z.infer<typeof rescheduleEventSchema>;

export const rescheduleEventIdSchema = z.object({
  eventId: z.string().uuid(),
});
