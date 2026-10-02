// The admin console is English only. Shared copy helpers in @abonten/core
// take a translator, so the console hands them the English one. Only the
// English `core` catalog is imported: several console screens are client
// components, and the other languages have no business in their bundle.

import type { CoreTranslator } from "@abonten/core/i18n/translator";
import core from "@abonten/i18n/messages/en/core.json";
import { createTranslator } from "use-intl/core";

const translate = createTranslator({
  locale: "en-GB",
  messages: { core },
  namespace: "core",
  onError: () => {},
  getMessageFallback: ({ key }) => key,
}) as unknown as (key: string, values?: Record<string, unknown>) => string;

export const tc: CoreTranslator = (key, values) => translate(key, values);
