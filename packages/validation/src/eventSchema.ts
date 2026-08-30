import { WEBSITE_URL_REGEX } from "@abonten/core/urlValidation";
import { z } from "zod";

// Validation messages are injected by the caller (the web app resolves them
// through next-intl; a native app can pass its own). This keeps the schema
// package free of any i18n-framework dependency.
export type EventSchemaMessages = {
  titleRequired: string;
  titleTooLong: string;
  descriptionRequired: string;
  invalidUrl: string;
  priceNotNumber: string;
  priceNegative: string;
  capacityNotNumber: string;
  capacityNotWhole: string;
  capacityMustBePositive: string;
};

export const getEventSchema = (m: EventSchemaMessages) =>
  z.object({
    title: z
      .string()
      .min(1, { message: m.titleRequired })
      .max(150, { message: m.titleTooLong }),

    description: z.string().min(1, { message: m.descriptionRequired }),

    website_url: z
      .string()
      .refine((val) => val === "" || WEBSITE_URL_REGEX.test(val), {
        message: m.invalidUrl,
      })
      .optional(),

    price: z
      .number({ invalid_type_error: m.priceNotNumber })
      .min(0, { message: m.priceNegative })
      .optional(),

    capacity: z
      .number({ invalid_type_error: m.capacityNotNumber })
      .int({ message: m.capacityNotWhole })
      .positive({ message: m.capacityMustBePositive })
      .optional(),
  });

export type EventSchema = z.infer<ReturnType<typeof getEventSchema>>;
