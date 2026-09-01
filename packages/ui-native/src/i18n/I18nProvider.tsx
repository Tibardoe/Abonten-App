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
  CATALOG,
  I18N_LOCALES,
  type I18nLocale,
  type Messages,
} from "./catalog";

// Mirrors the web app's next-intl setup: a provider at the root, a
// `useTranslations(namespace)` hook returning `t("nested.key", { name })`.
// Locale is remembered per device (Settings → Language) and defaults to the
// device language when we have a catalog for it, else English. Interpolation
// is the `{placeholder}` subset next-intl shares — enough for the current
// catalogs; upgrade to full ICU if a message ever needs plurals.

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

function lookup(messages: Messages, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
  return typeof value === "string" ? value : undefined;
}

function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

type I18nContextValue = {
  locale: I18nLocale;
  setLocale: (next: I18nLocale) => void;
  /** Resolve a `namespace.nested.key` against the active + English catalogs. */
  resolve: (
    namespace: string,
    key: string,
    values?: Record<string, string | number>,
  ) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

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
  }, []);

  const resolve = useCallback<I18nContextValue["resolve"]>(
    (namespace, key, values) => {
      const active = CATALOG[locale]?.[namespace] ?? {};
      const fallback = CATALOG[DEFAULT_LOCALE]?.[namespace] ?? {};
      const template =
        lookup(active, key) ?? lookup(fallback, key) ?? `${namespace}.${key}`;
      return interpolate(template, values);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, resolve }),
    [locale, setLocale, resolve],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "useTranslations/useLocale must be used within <I18nProvider>",
    );
  }
  return ctx;
}

/** next-intl-shaped: `const t = useTranslations("navigation"); t("home")`. */
export function useTranslations(namespace: string) {
  const { resolve } = useI18n();
  return useCallback(
    (key: string, values?: Record<string, string | number>) =>
      resolve(namespace, key, values),
    [resolve, namespace],
  );
}

export function useLocale() {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}
