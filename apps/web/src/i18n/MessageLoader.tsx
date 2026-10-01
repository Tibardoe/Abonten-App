"use client";

import { type Messages, mergeMessages } from "@abonten/core/i18n/pickMessages";
import { BROWSER_NAMESPACE_LOADERS } from "@abonten/i18n/browser";
import type { I18nLocale, I18nNamespace } from "@abonten/i18n/namespaces";
import {
  type IntlError,
  IntlErrorCode,
  NextIntlClientProvider,
  useLocale,
  useMessages,
} from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addClientTranslations,
  setNamespaceRequester,
} from "./clientTranslator";

// A page arrives with the messages its part of the site reads in the
// browser (see scripts/i18n/gen-route-messages.mjs), not with every
// catalog. Two things can still need more:
//
//   - a dialog that opens later (lazyWithMessages): its namespaces are
//     fetched when it first opens;
//   - a key the analysis did not see coming: instead of showing
//     "events.title" the namespace is fetched on the spot, the text
//     appears a moment later, and the console says which key it was.
//
// Each namespace is its own cached file, so this happens once per visitor.

type Loader = {
  /** Every one of these namespaces is complete, or could not be fetched. */
  has(namespaces: readonly string[]): boolean;
  /** Fetches the ones that are not here yet. */
  load(namespaces: readonly string[]): void;
};

const LoaderContext = createContext<Loader | null>(null);

type Fetched = { locale: string; full: Record<string, Messages> };
const NONE: Record<string, Messages> = {};

const isBrowserNamespace = (name: string): name is I18nNamespace =>
  Object.hasOwn(BROWSER_NAMESPACE_LOADERS, name);

declare global {
  interface Window {
    /** Keys that had to be fetched after the page arrived (read by the e2e suite). */
    __abontenLateMessages?: string[];
  }
}

function noteLate(path: string) {
  if (typeof window === "undefined") return;
  window.__abontenLateMessages ??= [];
  if (window.__abontenLateMessages.includes(path)) return;
  window.__abontenLateMessages.push(path);
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[i18n] "${path}" was not sent with this page, so its namespace was fetched. Run: node scripts/i18n/gen-route-messages.mjs`,
    );
  }
}

/** The root provider's second half: fetches what a page did not bring. */
export default function MessageLoader({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const sent = useMessages() as Messages;
  const [fetched, setFetched] = useState<Fetched>({ locale, full: NONE });
  // "fr:events" while it is on its way, and for good once it has failed.
  const requested = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const [failures, setFailures] = useState(0);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const full = fetched.locale === locale ? fetched.full : NONE;
  const fullRef = useRef(full);
  fullRef.current = full;

  const load = useCallback(
    (namespaces: readonly string[]) => {
      for (const namespace of namespaces) {
        if (!isBrowserNamespace(namespace)) continue;
        const id = `${locale}:${namespace}`;
        if (requested.current.has(id)) continue;
        requested.current.add(id);
        failed.current.delete(id);
        BROWSER_NAMESPACE_LOADERS[namespace](locale as I18nLocale).then(
          (loaded) => {
            // The language changed while this was on its way.
            if (localeRef.current !== locale) return;
            setFetched((previous) =>
              previous.locale === locale
                ? {
                    locale,
                    full: { ...previous.full, [namespace]: loaded.default },
                  }
                : { locale, full: { [namespace]: loaded.default } },
            );
          },
          (error) => {
            // Offline, or a deploy replaced the file: say so once, and
            // let an explicit request (reopening the dialog) try again.
            requested.current.delete(id);
            failed.current.add(id);
            setFailures((count) => count + 1);
            console.error(`[i18n] could not fetch "${namespace}"`, error);
          },
        );
      }
    },
    [locale],
  );

  // The language changed (Settings › Language): what was fetched in the
  // old one is fetched again in the new one.
  useEffect(() => {
    if (fetched.locale === locale) return;
    const again = Object.keys(fetched.full);
    setFetched({ locale, full: NONE });
    load(again);
  }, [fetched, locale, load]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `failures` re-makes the answer when a fetch fails (the set itself is a ref)
  const loader = useMemo<Loader>(
    () => ({
      has: (namespaces) =>
        namespaces.every(
          (namespace) =>
            namespace in full ||
            !isBrowserNamespace(namespace) ||
            failed.current.has(`${locale}:${namespace}`),
        ),
      load,
    }),
    [full, locale, load, failures],
  );

  const messages = useMemo(
    () => (full === NONE ? sent : { ...sent, ...full }),
    [sent, full],
  );

  // Plain browser helpers (share, upload) word their toasts from the same
  // messages the page holds: see i18n/clientTranslator.ts.
  addClientTranslations(locale, messages);
  useEffect(() => {
    setNamespaceRequester((namespace) => load([namespace]));
    return () => setNamespaceRequester(null);
  }, [load]);

  const getMessageFallback = useCallback(
    ({
      namespace,
      key,
      error,
    }: {
      namespace?: string;
      key: string;
      error: IntlError;
    }) => {
      const path = namespace ? `${namespace}.${key}` : key;
      if (error.code !== IntlErrorCode.MISSING_MESSAGE) return path;
      const top = path.split(".")[0];
      const fetchable =
        isBrowserNamespace(top) &&
        !(top in fullRef.current) &&
        !failed.current.has(`${locale}:${top}`);
      if (!fetchable) {
        // The whole namespace is here and the key is not in it.
        console.error(error);
        return path;
      }
      if (typeof window !== "undefined") {
        noteLate(path);
        // Not during this render: the fetch ends in a state change.
        queueMicrotask(() => load([top]));
      }
      // Nothing for a moment, on the server and in the browser alike,
      // rather than a key name.
      return "";
    },
    [locale, load],
  );

  const onError = useCallback((error: IntlError) => {
    // A missing message is settled in getMessageFallback above.
    if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
    console.error(error);
  }, []);

  return (
    <LoaderContext.Provider value={loader}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        getMessageFallback={getMessageFallback}
        onError={onError}
      >
        {children}
      </NextIntlClientProvider>
    </LoaderContext.Provider>
  );
}

/**
 * Adds one part of the site's messages to what the page already holds
 * (see SegmentMessages.tsx). A nested next-intl provider replaces the
 * messages above it; this one merges.
 */
export function MergeMessages({
  messages,
  children,
}: {
  messages: Messages;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const above = useMessages() as Messages;
  const merged = useMemo(
    () => mergeMessages(messages, above),
    [above, messages],
  );
  addClientTranslations(locale, merged);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * True once these namespaces are complete in the browser; asks for them
 * otherwise. For code that opens later (lazyWithMessages.tsx).
 */
export function useNamespaces(namespaces: readonly string[]): boolean {
  const loader = useContext(LoaderContext);
  const ready = loader ? loader.has(namespaces) : true;
  useEffect(() => {
    if (loader && !ready) loader.load(namespaces);
  }, [loader, ready, namespaces]);
  return ready;
}
