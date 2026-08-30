import { loadAllNamespaces } from "@abonten/i18n/catalog";
import type { Locale } from "./config";

export type Messages = Record<string, unknown>;

// The translation catalogs and per-namespace lazy loading now live in
// @abonten/i18n so the native app can reuse them. This wrapper keeps the
// existing web call sites (request.ts, LocaleProvider.tsx) unchanged.
export function loadMessages(locale: Locale): Promise<Messages> {
  return loadAllNamespaces(locale);
}
