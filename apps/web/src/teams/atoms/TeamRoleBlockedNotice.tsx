"use client";

import { useSwitchActingTeam } from "@/teams/useActingContext";
import { useTranslations } from "next-intl";

/**
 * A screen opened while managing as a team whose role does not cover it:
 * says so, and offers the person's own account.
 */
export default function TeamRoleBlockedNotice() {
  const t = useTranslations("teams");
  const switchTeam = useSwitchActingTeam();
  return (
    <div className="mx-auto max-w-md space-y-3 py-20 text-center">
      <p className="text-sm text-muted-foreground">{t("roleDoesNotCover")}</p>
      <button
        type="button"
        onClick={() => void switchTeam(null)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t("useOwnAccount")}
      </button>
    </div>
  );
}
