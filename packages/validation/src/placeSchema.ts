import { WEBSITE_URL_REGEX } from "@abonten/core/urlValidation";
import { z } from "zod";

// Simple format check, not a strict international-format validator — good
// enough to catch obvious typos without rejecting real numbers written in
// varied local styles (spaces, dashes, parentheses, optional leading +).
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

// Validation messages are injected by the caller — see eventSchema.ts.
export type PlaceSchemaMessages = {
  nameRequired: string;
  nameTooLong: string;
  descriptionRequired: string;
  descriptionTooLong: string;
  invalidUrl: string;
  invalidPhone: string;
  invalidWhatsapp: string;
};

export const getPlaceSchema = (m: PlaceSchemaMessages) =>
  z.object({
    name: z
      .string()
      .min(1, { message: m.nameRequired })
      .max(150, { message: m.nameTooLong }),

    // Matches place_description_check in
    // supabase/migrations/20260820090000_add_places_feature.sql — keep this
    // max in sync with that constraint.
    description: z
      .string()
      .min(1, { message: m.descriptionRequired })
      .max(2000, { message: m.descriptionTooLong }),

    website_url: z
      .string()
      .refine((val) => val === "" || WEBSITE_URL_REGEX.test(val), {
        message: m.invalidUrl,
      })
      .optional(),

    phone: z
      .string()
      .refine((val) => val === "" || PHONE_REGEX.test(val), {
        message: m.invalidPhone,
      })
      .optional(),

    whatsapp: z
      .string()
      .refine((val) => val === "" || PHONE_REGEX.test(val), {
        message: m.invalidWhatsapp,
      })
      .optional(),
  });

export type PlaceSchema = z.infer<ReturnType<typeof getPlaceSchema>>;
