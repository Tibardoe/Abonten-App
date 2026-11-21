"use client";

import { getMoveEventToTeamOptions } from "@/actions/teams/getMoveEventToTeamOptions";
import { moveEventToTeam } from "@/actions/teams/moveEventToTeam";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { useSwitchActingTeam } from "@/teams/useActingContext";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Manage › Details, on the person's own event: move it (its whole run) into
 * a team they are an Owner of, so the team's members can manage it too
 * (docs/architecture/team-accounts.md, "Move events into a team"). Shown
 * only to Owners of a team; once people have bought or registered it says
 * the event stays where it is.
 */
export default function MoveEventToTeamCard({ eventId }: { eventId: string }) {
  const t = useTranslations("events");
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const switchTeam = useSwitchActingTeam();
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { data } = useQuery({
    queryKey: ["move-event-to-team", eventId],
    queryFn: async () => {
      const res = await getMoveEventToTeamOptions({ eventId });
      answerOrThrow(res);
      return res.status === 200 && "data" in res ? res.data : null;
    },
    staleTime: 30_000,
  });

  if (!data || data.teams.length === 0) return null;
  const team = data.teams.find((x) => x.id === chosen) ?? data.teams[0];
  const teamName = team.name ?? `@${team.username ?? ""}`;

  const move = () =>
    start(async () => {
      const ok = await confirm({
        title: t("moveToTeamConfirm", {
          count: data.eventCount,
          team: teamName,
        }),
        confirmLabel: t("moveToTeamButton", { team: teamName }),
      });
      if (!ok) return;
      const res = await moveEventToTeam({ eventId, teamId: team.id }).catch(
        actionUnreachable,
      );
      if (res.status !== 200) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "");
      // The event is the team's now: manage it as the team.
      await switchTeam(team.id);
      router.push(`/manage/events/${eventId}`);
    });

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div>
        <h2 className="font-semibold text-lg">{t("moveToTeamTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("moveToTeamIntro")}</p>
      </div>

      {data.hasSales ? (
        <p className="text-sm text-muted-foreground">
          {t("moveToTeamHasSales")}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {t("moveToTeamRun", { count: data.eventCount })}
          </p>
          {data.teams.length > 1 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("moveToTeamChoose")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {data.teams.map((x) => (
                  <Button
                    key={x.id}
                    type="button"
                    size="sm"
                    variant={x.id === team.id ? "default" : "outline"}
                    aria-pressed={x.id === team.id}
                    onClick={() => setChosen(x.id)}
                  >
                    {x.name ?? `@${x.username ?? ""}`}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          <Button type="button" onClick={move} disabled={pending}>
            {t("moveToTeamButton", { team: teamName })}
          </Button>
        </>
      )}
    </div>
  );
}
