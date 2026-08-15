"use client";

import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  LOCALE_COOKIE_NAME,
  type Locale,
  defaultLocale,
  isLocale,
} from "./config";
import { type Messages, loadMessages } from "./messages";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function readCookieLocale(): Locale | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]+)`),
  );
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isLocale(value) ? value : null;
}

// The root layout always server-renders `defaultLocale` (see layout.tsx) so
// it — and every page under it — can be statically generated/ISR'd instead
// of being forced dynamic by a per-request cookie read. This provider
// corrects to the visitor's saved locale on the client right after mount,
// and lets Language.tsx apply a locale instantly on selection. Trade-off:
// non-default-locale visitors see a brief flash of the default locale
// before it switches.
export default function LocaleProvider({
  defaultMessages,
  children,
}: {
  defaultMessages: Messages;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState<Messages>(defaultMessages);

  // Guards against two overlapping setLocale calls (the mount effect's
  // cookie-correction and a manual pick from Language.tsx) resolving out of
  // order — without this, a slower earlier call can overwrite a faster,
  // newer one after it already resolved.
  const generationRef = useRef(0);

  const setLocale = useCallback(
    async (next: Locale) => {
      const generation = ++generationRef.current;

      if (next === defaultLocale) {
        setLocaleState(next);
        setMessages(defaultMessages);
        return;
      }

      const nextMessages = await loadMessages(next);

      if (generation !== generationRef.current) return;

      setLocaleState(next);
      setMessages(nextMessages);
    },
    [defaultMessages],
  );

  useEffect(() => {
    const cookieLocale = readCookieLocale();
    if (cookieLocale && cookieLocale !== defaultLocale) {
      setLocale(cookieLocale);
    }
    // setLocale is stable (useCallback, only depends on the defaultMessages
    // prop) — this only needs to run once, on mount, to correct from the
    // server's default-locale render to the visitor's saved locale.
  }, [setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="Africa/Accra"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSwitcher() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleSwitcher must be used within LocaleProvider");
  }
  return context;
}
