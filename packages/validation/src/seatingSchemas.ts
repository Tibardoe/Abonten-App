import { z } from "zod";

// Assigned seats (docs/architecture/assigned-seats.md): the shapes the web
// actions accept. The rules (sections, row labels, seats per row) are
// @abonten/core/seating's, checked by the service in the person's language.

const row = z.object({
  label: z.string().max(10),
  seats: z.number().int(),
});

export const saveSeatingPlanSchema = z.object({
  planId: z.string().uuid().nullish(),
  name: z.string().max(100),
  sections: z
    .array(
      z.object({
        id: z.string().uuid().nullish(),
        name: z.string().max(100),
        rows: z.array(row).max(200),
      }),
    )
    .max(40),
});
export type SaveSeatingPlanInput = z.infer<typeof saveSeatingPlanSchema>;

export const setEventSeatingSchema = z.object({
  eventId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
  sections: z.record(z.string().uuid(), z.string().uuid().nullable()),
});
export type SetEventSeatingInput = z.infer<typeof setEventSeatingSchema>;
