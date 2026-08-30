import { WEBSITE_URL_REGEX } from "@abonten/core/urlValidation";
import type { useTranslations } from "next-intl";
import { z } from "zod";

export const getEventSchema = (
  t: ReturnType<typeof useTranslations<"events">>,
) =>
  z.object({
    title: z
      .string()
      .min(1, { message: t("validation.titleRequired") })
      .max(150, { message: t("validation.titleTooLong") }),

    description: z
      .string()
      .min(1, { message: t("validation.descriptionRequired") }),

    website_url: z
      .string()
      .refine((val) => val === "" || WEBSITE_URL_REGEX.test(val), {
        message: t("validation.invalidUrl"),
      })
      .optional(),

    price: z
      .number({ invalid_type_error: t("validation.priceNotNumber") })
      .min(0, { message: t("validation.priceNegative") })
      .optional(),

    capacity: z
      .number({ invalid_type_error: t("validation.capacityNotNumber") })
      .int({ message: t("validation.capacityNotWhole") })
      .positive({ message: t("validation.capacityMustBePositive") })
      .optional(),
  });

export type EventSchema = z.infer<ReturnType<typeof getEventSchema>>;
