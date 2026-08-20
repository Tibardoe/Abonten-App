import type { useTranslations } from "next-intl";
import { z } from "zod";

// Simple format check, not a strict international-format validator — good
// enough to catch obvious typos without rejecting real numbers written in
// varied local styles (spaces, dashes, parentheses, optional leading +).
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export const getPlaceSchema = (
  t: ReturnType<typeof useTranslations<"places">>,
) =>
  z.object({
    name: z
      .string()
      .min(1, { message: t("validation.nameRequired") })
      .max(150, { message: t("validation.nameTooLong") }),

    // Matches place_description_check in
    // supabase/migrations/20260820090000_add_places_feature.sql — keep this
    // max in sync with that constraint.
    description: z
      .string()
      .min(1, { message: t("validation.descriptionRequired") })
      .max(2000, { message: t("validation.descriptionTooLong") }),

    website_url: z
      .string()
      .refine(
        (val) =>
          val === "" ||
          /^((https?:\/\/)?(www\.)?[a-zA-Z0-9\-]+\.[a-z]{2,})(\/\S*)?$/.test(
            val,
          ),
        {
          message: t("validation.invalidUrl"),
        },
      )
      .optional(),

    phone: z
      .string()
      .refine((val) => val === "" || PHONE_REGEX.test(val), {
        message: t("validation.invalidPhone"),
      })
      .optional(),

    whatsapp: z
      .string()
      .refine((val) => val === "" || PHONE_REGEX.test(val), {
        message: t("validation.invalidWhatsapp"),
      })
      .optional(),
  });

export type PlaceSchema = z.infer<ReturnType<typeof getPlaceSchema>>;
