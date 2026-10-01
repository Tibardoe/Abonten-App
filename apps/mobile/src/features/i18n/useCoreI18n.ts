import type { CoreI18n } from "@abonten/core/i18n/translator";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMemo } from "react";

// The translator @abonten/core's copy helpers take (the `core` namespace)
// together with the language it speaks, for helpers that also format a
// number, a distance or a date. One hook so a screen writes
// `const i18n = useCoreI18n()` and hands it on.
export function useCoreI18n(): CoreI18n {
  const t = useTranslations("core");
  const { locale } = useLocale();
  return useMemo(() => ({ t, locale }), [t, locale]);
}
