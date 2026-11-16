"use client";

import { answerTeamInvite } from "@/actions/teams/answerTeamInvite";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import type { TeamInviteReceived } from "@abonten/types/teamType";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import TeamPersonAvatar from "../atoms/TeamPersonAvatar";
import TeamRoleChip from "../atoms/TeamRoleChip";
import ConvertAccountDialog from "../molecules/ConvertAccountDialog";
import CreateTeamDialog from "../molecules/CreateTeamDialog";
import { useRefreshTeams, useTeamsOverview } from "../useTeams";

/**
 * Settings › Teams: invitations waiting for the person, the teams they run,
 * and "Make a team" while the programme is open to them. A team that
 * exists stays here even when the programme is off, so nobody is trapped.
 */
export default function TeamsOverview() {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const { data, isPending, isError, refetch } = useTeamsOverview();
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState(false);

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/60" />;
  }
  if (isError || !data) {
    return (
      <div className="space-y-3 rounded-xl border border-border p-5">
        <p className="text-sm">{t("loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {data.invites.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("invitationsTitle")}</h2>
          {data.invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t("yourTeams")}</h2>
          {data.program.enabled ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              {t("makeTeam")}
            </Button>
          ) : null}
        </div>
        {data.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTeams")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {data.teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/settings/teams/${team.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-muted/50"
                >
                  <TeamPersonAvatar
                    publicId={team.avatarPublicId}
                    version={team.avatarVersion}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {personName(tc, {
                        full_name: team.name,
                        username: team.username,
                      })}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {team.username ? `@${team.username} · ` : ""}
                      {t("membersCount", { count: team.memberCount })}
                    </p>
                    {team.status !== "active" ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t("pausedShort")}
                      </p>
                    ) : null}
                  </div>
                  <TeamRoleChip role={team.role} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data.teams.length > 0 || data.program.enabled ? (
          <p className="text-xs text-muted-foreground">{t("comingSoon")}</p>
        ) : null}
      </section>

      {data.program.enabled && data.canConvert ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("convertTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("convertBody")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConverting(true)}
          >
            {t("convertAction")}
          </Button>
        </section>
      ) : null}

      <CreateTeamDialog open={creating} onOpenChange={setCreating} />
      <ConvertAccountDialog open={converting} onOpenChange={setConverting} />
    </div>
  );
}

function InviteRow({ invite }: { invite: TeamInviteReceived }) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const refresh = useRefreshTeams();
  const [busy, setBusy] = useState(false);

  const answer = async (action: "accept" | "decline") => {
    setBusy(true);
    const res = await answerTeamInvite({ inviteId: invite.id, action }).catch(
      actionUnreachable,
    );
    setBusy(false);
    if (res.status === 200) {
      toast.success(
        action === "accept" ? t("joinedToast") : t("declinedToast"),
      );
    } else {
      toast.error(res.message ?? t("couldNotDo"));
    }
    refresh();
  };

  const inviter = invite.invitedBy
    ? personName(tc, {
        full_name: invite.invitedBy.name,
        username: invite.invitedBy.username,
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <TeamPersonAvatar
        publicId={invite.team.avatarPublicId}
        version={invite.team.avatarVersion}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {personName(tc, {
              full_name: invite.team.name,
              username: invite.team.username,
            })}
          </p>
          <TeamRoleChip role={invite.role} />
        </div>
        <p className="text-sm text-muted-foreground">
          {inviter
            ? t("invitedByUntil", {
                name: inviter,
                date: formatDateTime(invite.expiresAt, locale),
              })
            : t("openUntil", {
                date: formatDateTime(invite.expiresAt, locale),
              })}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void answer("accept")}>
          {t("accept")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void answer("decline")}
        >
          {t("decline")}
        </Button>
      </div>
    </div>
  );
}
