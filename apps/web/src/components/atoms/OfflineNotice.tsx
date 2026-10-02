"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { MdWifiOff } from "react-icons/md";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Says so while the browser has no connection. Without it nothing on the
// page explained why a button did nothing or a list stopped loading; with
// it, the failure messages that follow ("You're offline. Check your
// connection…") are expected. It goes away by itself when the connection is
// back, and the data cache refetches what went stale (refetchOnReconnect).
//
// `navigator.onLine` only ever errs one way: it can say "online" on a
// network that reaches nothing, never "offline" on one that works.
export default function OfflineNotice() {
  const t = useTranslations("common");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <output className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex justify-center px-4 lg:bottom-4">
      <p className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
        <MdWifiOff aria-hidden="true" className="shrink-0" />
        {t("youReOffline")}
      </p>
    </output>
  );
}
