import { z } from "zod";

// Inputs of the app's address search (/api/mobile/addresses/*), answered by
// Google Places API (New) on the server. Query strings arrive as strings.

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().finite().min(min).max(max).optional(),
  );

// Google takes a URL-safe token of at most 36 characters.
const sessionToken = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,36}$/, "Invalid session");

export const addressSuggestSchema = z.object({
  q: z.string().max(200).default(""),
  session: sessionToken,
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
});

export const addressResolveSchema = z.object({
  placeId: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid place"),
  session: sessionToken,
});
