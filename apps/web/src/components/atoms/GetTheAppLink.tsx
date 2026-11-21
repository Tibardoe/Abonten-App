"use client";

import { cn } from "@/components/lib/utils";
import { APP_STORE_LISTINGS, getTheAppPath } from "@abonten/core/brand/qrLinks";
import { appOpenTarget } from "@abonten/core/social/appLinks";
import {
  LINK_SOURCE_PARAM,
  normalizeLinkSource,
} from "@abonten/core/social/linkSources";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { FiSmartphone } from "react-icons/fi";

// "Get the app" on an event or place page, for Android phones only. It goes
// through /go/app?open=<this page>&src=<the page's own source>, whose Play
// Store link carries the listing through the install, so the app opens on
// this event or place (docs/architecture/social-distribution.md). An iPhone
// has Safari's Smart App Banner (the page's apple-itunes-app tag) instead,
// and a computer has nothing to install, so neither shows anything here.

const subscribe = () => () => {};

/** The link on an Android phone; null anywhere else (and on the server). */
function androidHref(path: string): string | null {
  if (!APP_STORE_LISTINGS.android) return null;
  if (!/Android/i.test(navigator.userAgent)) return null;
  const target = appOpenTarget(path);
  if (!target) return null;
  const source = normalizeLinkSource(
    new URLSearchParams(window.location.search).get(LINK_SOURCE_PARAM),
  );
  return getTheAppPath(target, source);
}

export default function GetTheAppLink({
  path,
  className,
}: {
  /** The listing's own path: eventPath(code) or placePath(slug). */
  path: string;
  className?: string;
}) {
  const t = useTranslations("common");
  // Known only in the browser: the server renders nothing, so the page
  // never waits on it and hydration matches.
  const href = useSyncExternalStore(
    subscribe,
    () => androidHref(path),
    () => null,
  );
  if (!href) return null;

  return (
    <a
      href={href}
      className={cn(
        "w-full flex items-center justify-center gap-2 border border-border bg-background py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors",
        className,
      )}
    >
      <FiSmartphone aria-hidden className="text-base" />
      {t("getTheAbontenApp")}
    </a>
  );
}
