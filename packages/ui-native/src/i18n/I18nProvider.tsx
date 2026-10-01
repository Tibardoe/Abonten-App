import * as SecureStore from "expo-secure-store";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NativeModules, Platform } from "react-native";
import {
  IntlProvider,
  useFormatter as useIntlFormatter,
  useTranslations as useIntlTranslations,
} from "use-intl";
import { createTranslator } from "use-intl/core";
import { CATALOG, I18N_LOCALES, type I18nLocale } from "./catalog";

// The native twin of the web app's next-intl setup, on the same library
// core (use-intl): the same catalogs under @abonten/i18n, the same
// `useTranslations(namespace)` → `t("key", { name })`, the same ICU
// messages (plurals, `t.rich` with inline tags, select), and a
// `useFormatter()` for dates and numbers in the reader's language.
//
// The language is remembered per device (Settings → Language) and defaults
// to the device language when there is a catalog for it, else English.
// English is merged underneath every other catalog, so a key the
// translators have not reached yet still reads as English instead of a raw
// key path.

const STORAGE_KEY = "abonten.locale";
export const DEFAULT_LOCALE: I18nLocale = "en";

function deviceLocale(): I18nLocale {
  try {
    const tag =
      Platform.OS === "ios"
        ? (NativeModules.SettingsManager?.settings?.AppleLocale ??
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0])
        : NativeModules.I18nManager?.localeIdentifier;
    const lang = String(tag ?? "")
      .slice(0, 2)
      .toLowerCase();
    return (I18N_LOCALES as readonly string[]).includes(lang)
      ? (lang as I18nLocale)
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

type Messages = Record<string, unknown>;

function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    if (
      value &&
      typeof value === "object" &&
      current &&
      typeof current === "object"
    ) {
      out[key] = mergeMessages(current as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const messageCache = new Map<I18nLocale, Messages>();

function messagesFor(locale: I18nLocale): Messages {
  const cached = messageCache.get(locale);
  if (cached) return cached;
  const english = CATALOG[DEFAULT_LOCALE] as Messages;
  const merged =
    locale === DEFAULT_LOCALE
      ? english
      : mergeMessages(english, CATALOG[locale] as Messages);
  messageCache.set(locale, merged);
  return merged;
}

// Stable identities: use-intl rebuilds every translator when these change,
// and a translator that changes identity re-runs each effect that lists it.
function ignoreIntlError(): void {}

function keyPathFallback({
  namespace,
  key,
}: {
  namespace?: string;
  key: string;
}): string {
  return namespace ? `${namespace}.${key}` : key;
}

// The language the app is showing right now, for code outside React (the
// API client sends it with every request so the server answers in it).
let currentLocale: I18nLocale = DEFAULT_LOCALE;

export function getCurrentLocale(): I18nLocale {
  return currentLocale;
}

type ModuleTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;
const moduleTranslators = new Map<string, ModuleTranslator>();

/**
 * A translator for code that is not a component or a hook: a helper that
 * words a toast, a share message or an upload error (`src/lib`, a module
 * singleton). `translatorFor("common")("uploadFailed")` is resolved when it
 * is called, so it speaks the language the app is showing at that moment.
 * Inside React use useTranslations(): this one does not re-render anything.
 */
export function translatorFor(namespace: string): ModuleTranslator {
  return (key, values) => {
    const id = `${currentLocale}|${namespace}`;
    let translate = moduleTranslators.get(id);
    if (!translate) {
      translate = createTranslator({
        locale: intlTag(currentLocale),
        messages: messagesFor(currentLocale),
        namespace,
        onError: ignoreIntlError,
        getMessageFallback: keyPathFallback,
      }) as unknown as ModuleTranslator;
      moduleTranslators.set(id, translate);
    }
    return translate(key, values);
  };
}

type LocaleChangeListener = (locale: I18nLocale) => void;
const localeChangeListeners = new Set<LocaleChangeListener>();

/**
 * Called when the person picks a language in Settings (not on launch). The
 * app uses it to save the choice to their account so notifications and
 * emails arrive in it too.
 */
export function onLocaleChosen(listener: LocaleChangeListener): () => void {
  localeChangeListeners.add(listener);
  return () => {
    localeChangeListeners.delete(listener);
  };
}

type LocaleContextValue = {
  locale: I18nLocale;
  setLocale: (next: I18nLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

// Akan has no ICU data of its own; its numbers and dates follow the
// product's British English conventions.
function intlTag(locale: I18nLocale): string {
  return locale === "ak" ? "en-GB" : locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<I18nLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (
          !cancelled &&
          saved &&
          (I18N_LOCALES as readonly string[]).includes(saved)
        ) {
          setLocaleState(saved as I18nLocale);
          return;
        }
      } catch {
        // fall through to the device default
      }
      if (!cancelled) setLocaleState(deviceLocale());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: I18nLocale) => {
    setLocaleState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
    for (const listener of localeChangeListeners) listener(next);
  }, []);

  currentLocale = locale;

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  const messages = useMemo(() => messagesFor(locale), [locale]);

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider
        locale={intlTag(locale)}
        messages={messages}
        // A missing key is a catalog bug, not a crash: show the key path
        // (which the catalog parity check in CI would have refused) and
        // keep rendering.
        onError={ignoreIntlError}
        getMessageFallback={keyPathFallback}
      >
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

/** next-intl-shaped: `const t = useTranslations("navigation"); t("home")`. */
export const useTranslations = useIntlTranslations;

/** Dates and numbers in the reader's language: `format.dateTime(d, …)`. */
export const useFormatter = useIntlFormatter;

/** The app's language and the switch that changes it (Settings → Language). */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within <I18nProvider>");
  }
  return ctx;
}
