"use client";

import { cn } from "@/components/lib/utils";
import { useActingContext } from "@/teams/useActingContext";
import { teamRoleCan } from "@abonten/core/teams/roles";
import { useTranslations } from "next-intl";
import { useId } from "react";

type PublishingAsChoiceProps = {
  capability: "events.manage" | "places.manage";
  /** From useSwitchActingTeamInForm, called in the form's outermost part. */
  onSwitch: (teamId: string | null) => Promise<void>;
  /** A resumed draft or an event started from a place's page: only shown. */
  locked?: boolean;
  /** While publishing. */
  disabled?: boolean;
  className?: string;
};

/**
 * In the event and place create forms: who the listing goes out as. Shown
 * to anyone in a team whose role covers publishing it, and to anyone
 * managing as a team, so a listing never lands on the wrong account
 * unnoticed. The choices are the person's own account and each such team;
 * people with no such team see nothing.
 */
export default function PublishingAsChoice({
  capability,
  onSwitch,
  locked = false,
  disabled = false,
  className,
}: PublishingAsChoiceProps) {
  const t = useTranslations("teams");
  const labelId = useId();
  const acting = useActingContext();
  const current = acting.current;
  const eligible = acting.teams.filter((team) =>
    teamRoleCan(team.role, capability),
  );
  if (!current && eligible.length === 0) return null;

  const currentCovers = !current || teamRoleCan(current.role, capability);
  const options = [
    { id: null, label: t("yourAccount") },
    ...eligible.map((team) => ({
      id: team.id,
      label: team.name ?? `@${team.username ?? ""}`,
    })),
  ].filter((option) => !locked || option.id === (current?.id ?? null));

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-xs",
        className,
      )}
    >
      <fieldset
        aria-labelledby={labelId}
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        <span id={labelId} className="mr-1 font-medium text-muted-foreground">
          {t("publishingAsLabel")}
        </span>
        {options.map((option) => {
          const selected = option.id === (current?.id ?? null);
          return (
            <button
              key={option.id ?? "own"}
              type="button"
              aria-pressed={selected}
              disabled={locked || disabled}
              onClick={() => {
                if (!selected) void onSwitch(option.id);
              }}
              className={cn(
                "max-w-48 truncate rounded-full border px-3 py-1 font-medium transition-colors disabled:cursor-default",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent disabled:opacity-60",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      {!currentCovers ? (
        <p className="text-destructive">
          {t("publishingAsRoleCannot", {
            team: current?.name ?? current?.username ?? "",
          })}
        </p>
      ) : !locked ? (
        <p className="text-muted-foreground">{t("publishingAsHint")}</p>
      ) : null}
    </div>
  );
}
