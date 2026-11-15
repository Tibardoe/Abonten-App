"use client";

import { useSwitchActingTeam } from "@/teams/useActingContext";
import { useActingContext } from "@/teams/useActingContext";
import { teamRoleCan } from "@abonten/core/teams/roles";
import { useTranslations } from "next-intl";

/**
 * Over the inbox while it is a team's (managing as a team whose messages
 * the person answers): says whose it is, with the way back to their own.
 */
export default function TeamInboxBanner() {
  const t = useTranslations("teams");
  const acting = useActingContext();
  const switchTeam = useSwitchActingTeam();
  const team = acting.current;
  if (!team || !teamRoleCan(team.role, "messages.reply")) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-2 text-xs">
      <span className="truncate font-medium">
        {t("teamInbox", { team: team.name ?? team.username ?? "" })}
      </span>
      <button
        type="button"
        onClick={() => void switchTeam(null)}
        className="shrink-0 font-semibold text-primary hover:underline"
      >
        {t("useOwnAccount")}
      </button>
    </div>
  );
}
