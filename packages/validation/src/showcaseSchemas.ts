import { z } from "zod";

// "On Abonten" showcase inputs for the website and the app
// (docs/architecture/showcase.md). The console's own inputs are in
// adminSchemas.ts (English only). Coordinates arrive as query-string text
// from GET /api/mobile/showcase, so numbers are read from strings too.

const uuid = z.string().uuid("Invalid id");

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().finite().min(min).max(max).optional(),
  );

const optionalCountry = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
  z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase())
    .optional(),
);

/** The wall (or the directory) for a point or a market. */
export const showcaseWallRequestSchema = z.object({
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
  countryCode: optionalCountry,
});
export type ShowcaseWallRequest = z.infer<typeof showcaseWallRequestSchema>;

/** A tap on a tile, counted against its entry. */
export const showcaseTapSchema = z.object({
  entryId: uuid,
});
export type ShowcaseTapInput = z.infer<typeof showcaseTapSchema>;
