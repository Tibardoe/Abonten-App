"use client";

import { Button } from "@/components/ui/button";
import { useSwitchActingTeam } from "@/teams/useActingContext";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Shown on a manage page opened while managing as another account (often
 * from a notice about a team's listing): it belongs to one of the person's
 * teams, or to themselves. One click switches "Managing as" and the page
 * reloads as that account.
 */
export default function SwitchToTeamPrompt({
  target,
  message,
}: {
  target: { kind: "own" } | { kind: "team"; teamId: string; name: string };
  /** Said instead of whose listing it is (a page the role does not cover). */
  message?: string;
}) {
  const t = useTranslations("teams");
  const switchTeam = useSwitchActingTeam();
  const [busy, setBusy] = useState(false);

  const onSwitch = async () => {
    setBusy(true);
    await switchTeam(target.kind === "team" ? target.teamId : null);
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-8 text-center">
      <p className="text-muted-foreground">
        {message ??
          (target.kind === "team"
            ? t("listingBelongsToTeam", { team: target.name })
            : t("listingIsYours"))}
      </p>
      <Button type="button" disabled={busy} onClick={() => void onSwitch()}>
        {target.kind === "team"
          ? t("manageAsTeam", { team: target.name })
          : t("useOwnAccount")}
      </Button>
    </div>
  );
}
