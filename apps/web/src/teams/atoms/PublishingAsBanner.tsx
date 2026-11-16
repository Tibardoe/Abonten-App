"use client";

import {
  useActingContext,
  useSwitchActingTeam,
} from "@/teams/useActingContext";
import { teamRoleCan } from "@abonten/core/teams/roles";
import { useTranslations } from "next-intl";

/**
 * Over the Spotlight and Story screens while posting as a team (managing as
 * a team whose role covers content.post): says who the post will be from,
 * with the way back to the person's own account.
 */
export default function PublishingAsBanner() {
  const t = useTranslations("teams");
  const acting = useActingContext();
  const switchTeam = useSwitchActingTeam();
  const team = acting.current;
  if (!team || !teamRoleCan(team.role, "content.post")) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-xs">
      <span className="truncate font-medium">
        {t("publishingAs", { name: team.name ?? team.username ?? "" })}
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
