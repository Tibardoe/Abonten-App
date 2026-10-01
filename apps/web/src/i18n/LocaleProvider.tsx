"use client";

import { setUserLocale } from "@/actions/setUserLocale";
import { useLocale, useMessages } from "next-intl";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useTransition,
} from "react";
import { setClientTranslations } from "./clientTranslator";
import {
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
  TIME_ZONE_COOKIE_NAME,
} from "./config";

type LocaleContextValue = {
  locale: Locale;
  /** Saves the choice and re-renders the page in that language. */
  setLocale: (locale: Locale) => Promise<void>;
  isPending: boolean;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

// The language is decided on the server for every request (see
// i18n/routing.ts): the page arrives already translated, with the right
// `lang` on <html>, so there is no English first paint to correct here.
// This provider does two small client-side jobs: remember the visitor's
// time zone for Server Actions, and switch language on request.
export default function LocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale() as Locale;
  // Plain browser helpers (share, upload) word their toasts from the same
  // catalogs the page was rendered with: see i18n/clientTranslator.ts.
  const messages = useMessages();
  setClientTranslations(locale, messages);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) {
        // Lets Server Actions count days in the visitor's own calendar.
        const cookie = `${TIME_ZONE_COOKIE_NAME}=${encodeURIComponent(zone)}`;
        if (!document.cookie.split("; ").includes(cookie)) {
          document.cookie = `${cookie}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${
            window.location.protocol === "https:" ? "; secure" : ""
          }`;
        }
      }
    } catch {
      // No Intl support: Server Actions fall back to the default zone.
    }
  }, []);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (next === locale) return;
      const response = await setUserLocale(next);
      if (response.status !== 200) {
        throw new Error(response.message);
      }
      // The cookie now names the new language; a refresh re-runs every
      // Server Component through the proxy, which rewrites to the new
      // locale's route tree. Client state (open menus, form drafts) stays.
      startTransition(() => {
        router.refresh();
      });
    },
    [locale, router],
  );

  const value = useMemo(
    () => ({ locale, setLocale, isPending }),
    [locale, setLocale, isPending],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocaleSwitcher() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleSwitcher must be used within LocaleProvider");
  }
  return context;
}
