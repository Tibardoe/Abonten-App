import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { RowListSkeleton } from "@/components/skeletons";
import { InviteMemberSheet, RoleChoice } from "@/features/teams/TeamSheets";
import {
  useCancelTeamInvite,
  useLeaveTeam,
  useRemoveTeamMember,
  useRenameTeam,
  useSetTeamMemberPlaces,
  useSetTeamMemberRole,
  useTeam,
} from "@/features/teams/useTeams";
import { useQueryView } from "@/lib/useQueryView";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { teamRolePlaceLimited } from "@abonten/core/teams/roles";
import type {
  TeamActivityEntry,
  TeamMember,
  TeamPerson,
  TeamRoleCode,
} from "@abonten/types/teamType";
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  Icon,
  Input,
  Refresher,
  Sheet,
  Tag,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// One team, as its member sees it (docs/architecture/team-accounts.md):
// who is in it and in which role. Owners also invite, change roles, remove,
// rename, withdraw invitations and see the activity. Anyone may leave,
// except the last Owner.

/** An Owner's sheet for one member: their role, or removing them. */
function MemberSheet({
  teamId,
  member,
  isMe,
  places,
  onClose,
}: {
  teamId: string;
  member: TeamMember | null;
  isMe: boolean;
  /** The team's places, for limiting Front desk and Door staff. */
  places: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const toast = useToast();
  const setRole = useSetTeamMemberRole();
  const setPlaces = useSetTeamMemberPlaces();
  const remove = useRemoveTeamMember();
  const [role, setLocalRole] = useState<TeamRoleCode | null>(null);
  const [placeIds, setPlaceIds] = useState<string[] | null>(null);
  const chosen = role ?? member?.role ?? "manager";
  // Front desk and Door staff can be limited to some of a chain's places.
  const limitable = member ? teamRolePlaceLimited(member.role) : false;
  const chosenPlaces = placeIds ?? member?.placeIds ?? [];
  const placesChanged =
    placeIds !== null &&
    [...placeIds].sort().join() !== [...(member?.placeIds ?? [])].sort().join();
  const name = member
    ? (personName(tc, {
        full_name: member.person.name,
        username: member.person.username,
      }) ?? "")
    : "";

  const close = () => {
    setLocalRole(null);
    setPlaceIds(null);
    onClose();
  };

  const savePlaces = async (): Promise<boolean> => {
    if (!member || !placesChanged) return true;
    try {
      const res = await setPlaces.mutateAsync({
        teamId,
        userId: member.person.id,
        placeIds: chosenPlaces,
      });
      if (res.status === 200) {
        toast.success(t("placesSavedToast"));
        return true;
      }
      toast.error(res.message ?? t("couldNotDo"));
    } catch {
      toast.error(t("couldNotDo"));
    }
    return false;
  };

  const save = async () => {
    if (!member) return close();
    // The places go first: a new role that is not limited clears them.
    if (chosen === member.role) {
      if (await savePlaces()) close();
      return;
    }
    try {
      const res = await setRole.mutateAsync({
        teamId,
        userId: member.person.id,
        role: chosen,
      });
      if (res.status === 200) {
        toast.success(t("roleChangedToast"));
        close();
      } else {
        toast.error(res.message ?? t("couldNotDo"));
      }
    } catch {
      toast.error(t("couldNotDo"));
    }
  };

  const askRemove = () => {
    if (!member) return;
    Alert.alert(t("removeConfirmTitle", { name }), t("removeConfirmBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: async () => {
          try {
            const res = await remove.mutateAsync({
              teamId,
              userId: member.person.id,
            });
            if (res.status === 200) {
              toast.success(t("removedToast"));
              close();
            } else {
              toast.error(res.message ?? t("couldNotDo"));
            }
          } catch {
            toast.error(t("couldNotDo"));
          }
        },
      },
    ]);
  };

  return (
    <Sheet
      open={!!member}
      onClose={close}
      title={name}
      footer={
        <View className="gap-2">
          <Button
            title={t("save")}
            loading={setRole.isPending || setPlaces.isPending}
            disabled={
              setRole.isPending || setPlaces.isPending || remove.isPending
            }
            onPress={save}
          />
          {!isMe ? (
            <Button
              title={t("remove")}
              variant="outline"
              disabled={setRole.isPending || remove.isPending}
              onPress={askRemove}
            />
          ) : null}
        </View>
      }
    >
      <View className="gap-4">
        <RoleChoice value={chosen} onPick={setLocalRole} />
        {limitable && chosen === member?.role ? (
          <View className="gap-2">
            <AppText variant="sectionHeading">{t("places")}</AppText>
            <AppText variant="small" tone="muted">
              {t("placesBody")}
            </AppText>
            {places.length === 0 ? (
              <AppText variant="meta">{t("noPlacesYet")}</AppText>
            ) : (
              places.map((place) => {
                const on = chosenPlaces.includes(place.id);
                return (
                  <Pressable
                    key={place.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={place.name}
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setPlaceIds(
                        on
                          ? chosenPlaces.filter((id) => id !== place.id)
                          : [...chosenPlaces, place.id],
                      )
                    }
                    className="flex-row items-center gap-3 py-1"
                  >
                    <Icon
                      name={on ? "checkbox" : "square-outline"}
                      size={22}
                      tone={on ? "primary" : "muted"}
                    />
                    <AppText className="flex-1">{place.name}</AppText>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function RenameSheet({
  teamId,
  open,
  current,
  verified,
  onClose,
}: {
  teamId: string;
  open: boolean;
  current: string;
  /** X42: a Verified team's new name goes back to review. */
  verified: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const rename = useRenameTeam();
  const [name, setName] = useState(current);

  const send = async () => {
    try {
      const res = await rename.mutateAsync({ teamId, name: name.trim() });
      if (res.status === 200) {
        // A renamed Verified team hears that its badge is back in review.
        toast.success(res.message ?? t("renamedToast"));
        onClose();
      } else {
        toast.error(res.message ?? t("couldNotDo"));
      }
    } catch {
      toast.error(t("couldNotDo"));
    }
  };

  // X42: the badge names the business, so a new name goes back to review.
  // Say so before it happens.
  const save = () => {
    if (!verified || name.trim() === current) {
      void send();
      return;
    }
    Alert.alert(t("renameVerifiedTitle"), t("renameVerifiedBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("renameVerifiedConfirm"), onPress: () => void send() },
    ]);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("rename")}
      footer={
        <Button
          title={t("save")}
          loading={rename.isPending}
          disabled={rename.isPending || !name.trim()}
          onPress={save}
        />
      }
    >
      <Input
        value={name}
        onChangeText={setName}
        accessibilityLabel={t("nameLabel")}
        placeholder={t("nameLabel")}
        maxLength={80}
      />
    </Sheet>
  );
}

function ActivityRow({ entry }: { entry: TeamActivityEntry }) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const nameOf = (p: TeamPerson | null) =>
    p
      ? (personName(tc, { full_name: p.name, username: p.username }) ??
        t("formerMember"))
      : t("formerMember");
  return (
    <View className="gap-0.5 border-b border-border py-2">
      <AppText variant="small">
        {t("activity", {
          // "member.joined" -> "member_joined": a select key in the catalog.
          action:
            entry.action === "member.account_closed" &&
            entry.details.reason === "under_age"
              ? "member_under_age"
              : entry.action.replace(/\./g, "_"),
          // A staff step (pause, resume, a new Owner) has no member actor.
          actor:
            entry.details.by === "staff"
              ? t("staffActor")
              : nameOf(entry.actor),
          subject: nameOf(entry.subject),
        })}
      </AppText>
      <AppText variant="caption">
        {formatDateTime(entry.createdAt, locale)}
      </AppText>
    </View>
  );
}

export default function TeamScreen() {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const router = useRouter();
  const { session } = useSession();
  const viewerId = session?.user.id ?? "";
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = typeof id === "string" ? id : "";
  const query = useTeam(teamId);
  const view = useQueryView(query);
  const leave = useLeaveTeam();
  const cancel = useCancelTeamInvite();
  const [inviting, setInviting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const detail = query.data?.status === 200 ? query.data.data : undefined;
  const notMember = query.data?.status === 404;

  const askLeave = (teamName: string) => {
    Alert.alert(
      t("leaveConfirmTitle", { team: teamName }),
      t("leaveConfirmBody"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("leave"),
          style: "destructive",
          onPress: async () => {
            try {
              const res = await leave.mutateAsync(teamId);
              if (res.status === 200) {
                toast.success(t("leftToast"));
                router.replace("/(app)/settings/teams");
              } else {
                toast.error(res.message ?? t("couldNotDo"));
              }
            } catch {
              toast.error(t("couldNotDo"));
            }
          },
        },
      ],
    );
  };

  const withdraw = async (inviteId: string) => {
    try {
      const res = await cancel.mutateAsync(inviteId);
      if (res.status === 200) toast.success(t("withdrawnToast"));
      else toast.error(res.message ?? t("couldNotDo"));
    } catch {
      toast.error(t("couldNotDo"));
    }
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("title")}
        backFallback="/(app)/settings/teams"
      />
      {notMember ? (
        <EmptyState icon="people-outline" title={t("notMember")} />
      ) : view.kind === "content" && detail ? (
        (() => {
          const { team } = detail;
          const isOwner = team.role === "owner";
          const active = team.status === "active";
          const owners = detail.members.filter((m) => m.role === "owner");
          const lastOwner = isOwner && owners.length <= 1;
          const teamName =
            personName(tc, {
              full_name: team.name,
              username: team.username,
            }) ?? "";
          return (
            <ScrollView
              contentContainerClassName="gap-6 p-4 pb-12"
              refreshControl={<Refresher onRefresh={() => query.refetch()} />}
            >
              <View className="flex-row items-center gap-3">
                <Avatar
                  publicId={team.avatarPublicId}
                  version={team.avatarVersion}
                  size={56}
                />
                <View className="flex-1 gap-1">
                  <AppText variant="screenTitle" numberOfLines={2}>
                    {teamName}
                  </AppText>
                  {team.username ? (
                    <AppText variant="meta">@{team.username}</AppText>
                  ) : null}
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <AppText variant="meta">{t("yourRole")}</AppText>
                <Tag label={t("role", { role: team.role })} />
              </View>

              {!active ? (
                <View className="rounded-xl bg-muted p-3">
                  <AppText variant="small" tone="warning">
                    {t("pausedLong")}
                  </AppText>
                </View>
              ) : null}
              <AppText variant="meta">{t("howToManage")}</AppText>

              {isOwner && active ? (
                <View className="flex-row gap-2">
                  <Button
                    title={t("invite")}
                    size="sm"
                    leftIcon="person-add-outline"
                    className="flex-1"
                    onPress={() => setInviting(true)}
                  />
                  <Button
                    title={t("rename")}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setRenaming(true)}
                  />
                </View>
              ) : null}

              <View className="gap-2">
                <AppText variant="sectionHeading">{t("membersTitle")}</AppText>
                {detail.members.map((member) => {
                  const isMe = member.person.id === viewerId;
                  const name =
                    personName(tc, {
                      full_name: member.person.name,
                      username: member.person.username,
                    }) ?? "";
                  const body = (
                    <View
                      key={member.person.id}
                      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <Avatar
                        publicId={member.person.avatarPublicId}
                        version={member.person.avatarVersion}
                        size={40}
                      />
                      <View className="flex-1">
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {isMe ? `${name} · ${t("you")}` : name}
                        </AppText>
                        <AppText variant="meta" numberOfLines={1}>
                          {member.person.username
                            ? `@${member.person.username}`
                            : ""}
                          {member.idChecked ? ` · ${t("idChecked")}` : ""}
                        </AppText>
                        {isOwner && teamRolePlaceLimited(member.role) ? (
                          <AppText variant="meta" numberOfLines={1}>
                            {t("places")}:{" "}
                            {member.placeIds?.length
                              ? t("placesSome", {
                                  count: member.placeIds.length,
                                })
                              : t("placesAll")}
                          </AppText>
                        ) : null}
                      </View>
                      <Tag label={t("role", { role: member.role })} />
                    </View>
                  );
                  return isOwner && active ? (
                    <Pressable
                      key={member.person.id}
                      accessibilityRole="button"
                      accessibilityLabel={name}
                      onPress={() => setEditing(member)}
                      className="active:opacity-80"
                    >
                      {body}
                    </Pressable>
                  ) : (
                    <View key={member.person.id}>{body}</View>
                  );
                })}
                <Button
                  title={t("leave")}
                  variant="outline"
                  size="sm"
                  disabled={lastOwner || leave.isPending}
                  onPress={() => askLeave(teamName)}
                />
                {lastOwner ? (
                  <AppText variant="meta">{t("lastOwnerHint")}</AppText>
                ) : null}
              </View>

              {detail.invites && detail.invites.length > 0 ? (
                <View className="gap-2">
                  <AppText variant="sectionHeading">
                    {t("pendingTitle")}
                  </AppText>
                  {detail.invites.map((invite) => (
                    <View
                      key={invite.id}
                      className="gap-2 rounded-xl border border-border bg-card p-3"
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <AppText
                          variant="bodyStrong"
                          numberOfLines={1}
                          className="flex-1"
                        >
                          {invite.to
                            ? (personName(tc, {
                                full_name: invite.to.name,
                                username: invite.to.username,
                              }) ?? "")
                            : (invite.toPhoneMasked ?? "")}
                        </AppText>
                        <Tag label={t("role", { role: invite.role })} />
                      </View>
                      <AppText variant="meta">
                        {t("openUntil", {
                          date: formatDateTime(invite.expiresAt, locale),
                        })}
                      </AppText>
                      {invite.toPhoneTexted === false ? (
                        <AppText variant="caption" tone="warning">
                          {t("notTexted")}
                        </AppText>
                      ) : null}
                      <Button
                        title={t("withdraw")}
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onPress={() => void withdraw(invite.id)}
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              {detail.activity && detail.activity.length > 0 ? (
                <View className="gap-1">
                  <AppText variant="sectionHeading">
                    {t("activityTitle")}
                  </AppText>
                  {detail.activity.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} />
                  ))}
                </View>
              ) : null}

              <InviteMemberSheet
                open={inviting}
                onClose={() => setInviting(false)}
                teamId={team.id}
              />
              <RenameSheet
                key={teamName}
                teamId={team.id}
                open={renaming}
                current={team.name ?? ""}
                verified={team.verified === true}
                onClose={() => setRenaming(false)}
              />
              <MemberSheet
                teamId={team.id}
                member={editing}
                isMe={editing?.person.id === viewerId}
                places={detail.places ?? []}
                onClose={() => setEditing(null)}
              />
            </ScrollView>
          );
        })()
      ) : (
        <QueryUnavailable
          view={view}
          subject={t("subjectTeam")}
          onRetry={() => query.refetch()}
          loading={<RowListSkeleton />}
          className="flex-1 justify-center"
        />
      )}
    </View>
  );
}
