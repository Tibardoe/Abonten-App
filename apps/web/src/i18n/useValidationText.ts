"use client";

import { translateValidation } from "@abonten/i18n/validation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Words a shared schema's message for the reader: the schemas in
 * @abonten/validation write English wherever they run, and this finds the
 * sentence in the `validation` catalog. Text it does not know (a message a
 * service already translated) is returned unchanged.
 */
export function useValidationText(): (
  message: string | null | undefined,
) => string {
  // The key is looked up at run time (it is found from the sentence), so the
  // translator is used through its plain (key, values) shape.
  const t = useTranslations("validation") as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  return useCallback((message) => translateValidation(t, message), [t]);
}
