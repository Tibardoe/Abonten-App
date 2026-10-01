"use client";

import { LOCALE_COOKIE_NAME, defaultLocale, isLocale } from "@/i18n/config";
import { reportClientError } from "@/lib/reportClientError";
import ak from "@abonten/i18n/messages/ak/fatal.json";
import de from "@abonten/i18n/messages/de/fatal.json";
import en from "@abonten/i18n/messages/en/fatal.json";
import es from "@abonten/i18n/messages/es/fatal.json";
import fr from "@abonten/i18n/messages/fr/fatal.json";
import pt from "@abonten/i18n/messages/pt/fatal.json";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useSyncExternalStore } from "react";

// The root layout is what failed, so nothing it provides is here: no
// translation provider, no theme. The three sentences of this screen are a
// catalog of their own (messages/<locale>/fatal.json), small enough to
// bring in every language, and the language is read from the cookie the
// proxy keeps.
const WORDS = { ak, de, en, es, fr, pt };

const subscribe = () => () => {};

function cookieLocale(): keyof typeof WORDS {
  const found = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`));
  const value = found?.slice(LOCALE_COOKIE_NAME.length + 1);
  return isLocale(value) ? value : defaultLocale;
}

// Catches errors thrown in the root layout itself. Reports to both the
// self-hosted observability pipeline and Sentry, then shows a minimal
// recovery screen.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      extra: { digest: error.digest, boundary: "global" },
    });
    Sentry.captureException(error);
  }, [error]);

  // English on the server (it has no cookie to read here), the visitor's
  // language as soon as the browser takes over.
  const locale = useSyncExternalStore(
    subscribe,
    cookieLocale,
    () => defaultLocale,
  );
  const words = WORDS[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18 }}>{words.title}</h1>
          <p style={{ color: "#666", fontSize: 14 }}>{words.body}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            {words.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
