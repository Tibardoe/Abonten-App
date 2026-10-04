// First: what the engine lacks of Intl (see the file).
import "./polyfills";
import { translateValidation } from "@abonten/i18n/validation";
import { requireOptionalNativeModule } from "expo-modules-core";
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

// expo-localization reads the language the system gives this app, which
// on Android 13+ and iOS can be chosen per app in the system settings (the
// app declares its languages through the plugin in app.json). A binary
// built before the module was added has no native side: ask whether it is
// there first and fall back to React Native's own constants. A try/catch
// around the require is not enough — Metro reports a module that fails to
// initialise as a fatal error before the catch sees it, and an update that
// relied on that crashed 0.3.0 installs for five minutes (2026-10-04).
function systemAppLanguage(): string | null {
  if (!requireOptionalNativeModule("ExpoLocalization")) return null;
  try {
    const { getLocales } = require("expo-localization") as {
      getLocales: () => { languageCode: string | null }[];
    };
    return getLocales()[0]?.languageCode ?? null;
  } catch {
    return null;
  }
}

function deviceLocale(): I18nLocale {
  try {
    const tag =
      systemAppLanguage() ??
      (Platform.OS === "ios"
        ? (NativeModules.SettingsManager?.settings?.AppleLocale ??
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0])
        : NativeModules.I18nManager?.localeIdentifier);
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

// A message that is missing or cannot be formatted is not a crash: the
// screen shows its key path and keeps rendering. It is not nothing either.
// It used to be dropped here without a word, which is how every plural in
// the app could fail on a phone (the engine had no Intl.PluralRules) while
// each check on a computer passed. Now it is said once per message: in the
// developer's console, and to whoever the app registers below (its error
// reporting), so a build in people's hands tells us.
type IntlProblem = {
  code?: string;
  message?: string;
  originalMessage?: string;
};

let intlErrorReporter: ((error: unknown) => void) | null = null;
const reportedIntlProblems = new Set<string>();

/** The app's hook for translation failures (once per message). */
export function setIntlErrorReporter(
  reporter: ((error: unknown) => void) | null,
): void {
  intlErrorReporter = reporter;
}

// A stable identity: use-intl rebuilds every translator when this changes,
// and a translator that changes identity re-runs each effect that lists it.
function onIntlError(error: unknown): void {
  const problem = error as IntlProblem;
  const id = `${problem.code ?? "error"}:${problem.originalMessage ?? problem.message ?? ""}`;
  if (reportedIntlProblems.has(id)) return;
  reportedIntlProblems.add(id);
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`[i18n] ${problem.code ?? "error"}: ${problem.message ?? ""}`);
  }
  try {
    intlErrorReporter?.(error);
  } catch {
    // reporting must never break rendering
  }
}

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
// Before the provider has mounted it is the device's language: that is what
// the splash and the root error screen, which render without any provider,
// are worded in.
let currentLocale: I18nLocale = deviceLocale();

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
        onError: onIntlError,
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
  /**
   * False until the saved choice has been read back. The app holds its
   * splash for it, so nobody sees a screen in one language turn into
   * another a moment after launch.
   */
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

// Akan has no ICU data of its own; its numbers and dates follow the
// product's British English conventions.
function intlTag(locale: I18nLocale): string {
  return locale === "ak" ? "en-GB" : locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // The device's language until the saved choice is read: for most people
  // they are the same, so nothing changes on screen when it arrives.
  const [locale, setLocaleState] = useState<I18nLocale>(deviceLocale);
  const [ready, setReady] = useState(false);

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
        }
      } catch {
        // keep the device's language
      }
      if (!cancelled) setReady(true);
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
    () => ({ locale, setLocale, ready }),
    [locale, setLocale, ready],
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
        onError={onIntlError}
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

/**
 * Words a shared schema's message for the reader (@abonten/validation
 * writes English wherever it runs). Text that is not one of the schema's
 * sentences is returned unchanged.
 */
export function useValidationText(): (
  message: string | null | undefined,
) => string {
  const t = useIntlTranslations("validation");
  return useCallback(
    (message) => translateValidation((key, values) => t(key, values), message),
    [t],
  );
}
