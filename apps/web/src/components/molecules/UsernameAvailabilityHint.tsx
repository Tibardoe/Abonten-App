"use client";

import type { UsernameCheckView } from "@/hooks/useUsernameAvailability";
import { useTranslations } from "next-intl";

/**
 * What the as-you-type username check found: free, taken (with two or
 * three free handles to tap), or that it could not check. Nothing while
 * the handle is empty, badly formed (the form says why) or unchanged.
 */
export default function UsernameAvailabilityHint({
  check,
  onPick,
}: {
  check: UsernameCheckView;
  /** Called with a suggested handle the person tapped. */
  onPick: (username: string) => void;
}) {
  const t = useTranslations("common");
  if (check.state === "idle") return null;
  if (check.state === "checking") {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t("usernameChecking")}
      </p>
    );
  }
  if (check.state === "failed") {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t("usernameCheckFailed")}
      </p>
    );
  }
  if (check.state === "available") {
    return (
      <p
        className="text-xs text-emerald-700 dark:text-emerald-400"
        aria-live="polite"
      >
        {t("usernameAvailable", { username: check.username })}
      </p>
    );
  }
  return (
    <div className="space-y-1.5" aria-live="polite">
      <p className="text-xs font-medium text-destructive">
        {t("usernameTaken", { username: check.username })}
      </p>
      {check.suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("usernameSuggestions")}
          </span>
          {check.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted"
            >
              @{suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
