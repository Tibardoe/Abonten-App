"use client";

import { cancelTeamInvite } from "@/actions/teams/cancelTeamInvite";
import { leaveTeam } from "@/actions/teams/leaveTeam";
import { removeTeamMember } from "@/actions/teams/removeTeamMember";
import { renameTeam } from "@/actions/teams/renameTeam";
import { setTeamMemberRole } from "@/actions/teams/setTeamMemberRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { TEAM_ROLES, isTeamRole } from "@abonten/core/teams/roles";
import type {
  TeamActivityEntry,
  TeamDetail,
  TeamMember,
  TeamPerson,
} from "@abonten/types/teamType";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TeamPersonAvatar from "../atoms/TeamPersonAvatar";
import TeamRoleChip from "../atoms/TeamRoleChip";
import InviteMemberDialog from "../molecules/InviteMemberDialog";
import { useRefreshTeams, useTeam } from "../useTeams";

/**
 * One team, as its member sees it: who is in it and in which role. Owners
 * also invite, change roles, remove, rename, withdraw invitations and see
 * the activity. Anyone may leave, except the last Owner.
 */
export default function TeamDetailView({
  teamId,
  viewerId,
}: {
  teamId: string;
  viewerId: string;
}) {
  const t = useTranslations("teams");
  const { data, isPending, isError, refetch } = useTeam(teamId);

  if (isPending) {
    return <div className="h-60 animate-pulse rounded-xl bg-muted/60" />;
  }
  if (isError) {
    return (
      <div className="space-y-3 rounded-xl border border-border p-5">
        <p className="text-sm">{t("loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("notMember")}</p>;
  }
  return <TeamDetailBody detail={data} viewerId={viewerId} />;
}

function TeamDetailBody({
  detail,
  viewerId,
}: {
  detail: TeamDetail;
  viewerId: string;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const refresh = useRefreshTeams();
  const [inviting, setInviting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(detail.team.name ?? "");
  const [busy, setBusy] = useState(false);

  const { team } = detail;
  const isOwner = team.role === "owner";
  const owners = detail.members.filter((m) => m.role === "owner").length;
  const lastOwner = isOwner && owners <= 1;
  const teamName =
    personName(tc, { full_name: team.name, username: team.username }) ?? "";

  const run = async (
    work: () => Promise<{ status: number; message?: string }>,
    done: string,
  ) => {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (res.status === 200) toast.success(done);
    else toast.error(res.message ?? t("couldNotDo"));
    refresh();
    return res.status === 200;
  };

  const leave = async () => {
    const ok = await confirm({
      title: t("leaveConfirmTitle", { team: teamName }),
      message: t("leaveConfirmBody"),
      confirmLabel: t("leave"),
    });
    if (!ok) return;
    if (
      await run(
        () => leaveTeam({ teamId: team.id }).catch(actionUnreachable),
        t("leftToast"),
      )
    ) {
      router.push("/settings/teams");
    }
  };

  const remove = async (member: TeamMember) => {
    const name =
      personName(tc, {
        full_name: member.person.name,
        username: member.person.username,
      }) ?? "";
    const ok = await confirm({
      title: t("removeConfirmTitle", { name }),
      message: t("removeConfirmBody"),
      confirmLabel: t("remove"),
    });
    if (!ok) return;
    await run(
      () =>
        removeTeamMember({ teamId: team.id, userId: member.person.id }).catch(
          actionUnreachable,
        ),
      t("removedToast"),
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <TeamPersonAvatar
          publicId={team.avatarPublicId}
          version={team.avatarVersion}
          size={56}
        />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={newName}
                maxLength={80}
                aria-label={t("nameLabel")}
                onChange={(e) => setNewName(e.target.value)}
                className="max-w-xs"
              />
              <Button
                size="sm"
                disabled={busy || !newName.trim()}
                onClick={async () => {
                  if (
                    await run(
                      () =>
                        renameTeam({ teamId: team.id, name: newName }).catch(
                          actionUnreachable,
                        ),
                      t("renamedToast"),
                    )
                  ) {
                    setRenaming(false);
                  }
                }}
              >
                {t("save")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRenaming(false)}
              >
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <h2 className="truncate text-xl font-semibold">{teamName}</h2>
          )}
          {team.username ? (
            <p className="text-sm text-muted-foreground">@{team.username}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("yourRole")}</span>
          <TeamRoleChip role={team.role} />
        </div>
      </header>

      {team.status !== "active" ? (
        <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-700 dark:text-amber-300">
          {t("pausedLong")}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("comingSoon")}</p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{t("membersTitle")}</h3>
          {isOwner && team.status === "active" ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRenaming(true)}
              >
                {t("rename")}
              </Button>
              <Button size="sm" onClick={() => setInviting(true)}>
                {t("invite")}
              </Button>
            </div>
          ) : null}
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {detail.members.map((member) => {
            const isMe = member.person.id === viewerId;
            return (
              <li
                key={member.person.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <TeamPersonAvatar
                  publicId={member.person.avatarPublicId}
                  version={member.person.avatarVersion}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {personName(tc, {
                      full_name: member.person.name,
                      username: member.person.username,
                    })}
                    {isMe ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("you")}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.person.username ? `@${member.person.username}` : ""}
                    {member.idChecked ? ` · ${t("idChecked")}` : ""}
                  </p>
                </div>
                {isOwner && team.status === "active" ? (
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label={t("roleLabel")}
                      value={member.role}
                      disabled={busy}
                      className="h-9 min-w-36"
                      onChange={(e) => {
                        const role = e.target.value;
                        if (!isTeamRole(role) || role === member.role) return;
                        void run(
                          () =>
                            setTeamMemberRole({
                              teamId: team.id,
                              userId: member.person.id,
                              role,
                            }).catch(actionUnreachable),
                          t("roleChangedToast"),
                        );
                      }}
                    >
                      {TEAM_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t("role", { role: r })}
                        </option>
                      ))}
                    </Select>
                    {!isMe ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void remove(member)}
                      >
                        {t("remove")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <TeamRoleChip role={member.role} />
                )}
              </li>
            );
          })}
        </ul>
        <div className="space-y-1">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || lastOwner}
            onClick={() => void leave()}
          >
            {t("leave")}
          </Button>
          {lastOwner ? (
            <p className="text-xs text-muted-foreground">
              {t("lastOwnerHint")}
            </p>
          ) : null}
        </div>
      </section>

      {detail.invites && detail.invites.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-semibold">{t("pendingTitle")}</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {detail.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {invite.to
                        ? personName(tc, {
                            full_name: invite.to.name,
                            username: invite.to.username,
                          })
                        : invite.toPhoneMasked}
                    </p>
                    <TeamRoleChip role={invite.role} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("openUntil", {
                      date: formatDateTime(invite.expiresAt, locale),
                    })}
                  </p>
                  {invite.toPhoneTexted === false ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {t("notTexted")}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        cancelTeamInvite({ inviteId: invite.id }).catch(
                          actionUnreachable,
                        ),
                      t("withdrawnToast"),
                    )
                  }
                >
                  {t("withdraw")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.activity && detail.activity.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-semibold">{t("activityTitle")}</h3>
          <ul className="space-y-2">
            {detail.activity.map((entry) => (
              <ActivityLine key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}

      <InviteMemberDialog
        teamId={team.id}
        open={inviting}
        onOpenChange={setInviting}
      />
    </div>
  );
}

function ActivityLine({ entry }: { entry: TeamActivityEntry }) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const locale = useLocale();
  const nameOf = (p: TeamPerson | null) =>
    p
      ? (personName(tc, { full_name: p.name, username: p.username }) ??
        t("formerMember"))
      : t("formerMember");
  return (
    <li className="flex flex-wrap justify-between gap-2 text-sm">
      <span>
        {t("activity", {
          // "member.joined" -> "member_joined": a select key in the catalog.
          action: entry.action.replace(/\./g, "_"),
          actor: nameOf(entry.actor),
          subject: nameOf(entry.subject),
        })}
      </span>
      <span className="text-muted-foreground">
        {formatDateTime(entry.createdAt, locale)}
      </span>
    </li>
  );
}
