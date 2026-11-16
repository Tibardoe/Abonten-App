import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { RowListSkeleton } from "@/components/skeletons";
import {
  ConvertAccountSheet,
  CreateTeamSheet,
} from "@/features/teams/TeamSheets";
import {
  useAnswerTeamInvite,
  useTeamsOverview,
} from "@/features/teams/useTeams";
import { useQueryView } from "@/lib/useQueryView";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import type { TeamInviteReceived, TeamSummary } from "@abonten/types/teamType";
import {
  AppText,
  Avatar,
  Button,
  Icon,
  Refresher,
  Tag,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// Settings › Teams: invitations waiting for the person, the teams they run,
// and "Make a team" while the programme is open to them. The native echo
// of the website's /settings/teams (docs/architecture/team-accounts.md).

function InviteCard({ invite }: { invite: TeamInviteReceived }) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const answer = useAnswerTeamInvite();

  const send = async (action: "accept" | "decline") => {
    try {
      const res = await answer.mutateAsync({
        inviteId: invite.id,
        action,
        ...(action === "accept" ? { adult: true } : {}),
      });
      if (res.status === 200) {
        toast.success(
          action === "accept" ? t("joinedToast") : t("declinedToast"),
        );
      } else {
        toast.error(res.message ?? t("couldNotDo"));
      }
    } catch {
      toast.error(t("couldNotDo"));
    }
  };

  // K7: joining says they are 18 or older.
  const reply = (action: "accept" | "decline") => {
    if (action === "decline") {
      void send(action);
      return;
    }
    Alert.alert(
      t("acceptAdultTitle", {
        team: invite.team.name ?? invite.team.username ?? "",
      }),
      t("acceptAdultBody"),
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("acceptAdultConfirm"), onPress: () => void send("accept") },
      ],
    );
  };

  const inviter = invite.invitedBy
    ? personName(tc, {
        full_name: invite.invitedBy.name,
        username: invite.invitedBy.username,
      })
    : null;
  const date = formatDateTime(invite.expiresAt, locale);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Avatar
          publicId={invite.team.avatarPublicId}
          version={invite.team.avatarVersion}
          size={44}
        />
        <View className="flex-1 gap-1">
          <AppText variant="bodyStrong" numberOfLines={1}>
            {personName(tc, {
              full_name: invite.team.name,
              username: invite.team.username,
            }) ?? ""}
          </AppText>
          <Tag
            label={t("role", { role: invite.role })}
            className="self-start"
          />
        </View>
      </View>
      <AppText variant="meta">
        {inviter
          ? t("invitedByUntil", { name: inviter, date })
          : t("openUntil", { date })}
      </AppText>
      <View className="flex-row gap-2">
        <Button
          title={t("accept")}
          size="sm"
          className="flex-1"
          loading={answer.isPending}
          disabled={answer.isPending}
          onPress={() => void reply("accept")}
        />
        <Button
          title={t("decline")}
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={answer.isPending}
          onPress={() => void reply("decline")}
        />
      </View>
    </View>
  );
}

function TeamRow({ team }: { team: TeamSummary }) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const router = useRouter();
  const name =
    personName(tc, { full_name: team.name, username: team.username }) ?? "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push(`/(app)/settings/team/${team.id}`)}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <Avatar
        publicId={team.avatarPublicId}
        version={team.avatarVersion}
        size={44}
      />
      <View className="flex-1 gap-0.5">
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {team.username ? `@${team.username} · ` : ""}
          {t("membersCount", { count: team.memberCount })}
        </AppText>
        <Tag
          label={t("role", { role: team.role })}
          className="mt-1 self-start"
        />
        {team.status !== "active" ? (
          <AppText variant="caption" tone="warning">
            {t("pausedShort")}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}

export default function TeamsScreen() {
  const t = useTranslations("teams");
  const router = useRouter();
  const query = useTeamsOverview();
  const view = useQueryView(query);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState(false);
  const data = query.data?.status === 200 ? query.data.data : undefined;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("title")}
        backFallback="/(app)/settings"
      />
      {view.kind === "content" && data ? (
        <ScrollView
          contentContainerClassName="gap-6 p-4 pb-12"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
        >
          <AppText variant="muted">{t("intro")}</AppText>

          {data.invites.length > 0 ? (
            <View className="gap-3">
              <AppText variant="sectionHeading">
                {t("invitationsTitle")}
              </AppText>
              {data.invites.map((invite) => (
                <InviteCard key={invite.id} invite={invite} />
              ))}
            </View>
          ) : null}

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <AppText variant="sectionHeading">{t("yourTeams")}</AppText>
              {data.program.enabled ? (
                <Button
                  title={t("makeTeam")}
                  size="sm"
                  leftIcon="add"
                  onPress={() => setCreating(true)}
                />
              ) : null}
            </View>
            {data.teams.length === 0 ? (
              <AppText variant="muted">{t("noTeams")}</AppText>
            ) : (
              data.teams.map((team) => <TeamRow key={team.id} team={team} />)
            )}
            {data.teams.length > 0 || data.program.enabled ? (
              <AppText variant="meta">{t("howToManage")}</AppText>
            ) : null}
          </View>

          {data.program.enabled && data.canConvert ? (
            <View className="gap-3 rounded-xl border border-border bg-card p-4">
              <AppText variant="sectionHeading">{t("convertTitle")}</AppText>
              <AppText variant="small" tone="muted">
                {t("convertBody")}
              </AppText>
              <Button
                title={t("convertAction")}
                size="sm"
                variant="outline"
                onPress={() => setConverting(true)}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <QueryUnavailable
          view={view}
          subject={t("subjectTeams")}
          onRetry={() => query.refetch()}
          loading={<RowListSkeleton />}
          className="flex-1 justify-center"
        />
      )}
      <ConvertAccountSheet
        open={converting}
        onClose={() => setConverting(false)}
        onConverted={(id) => router.push(`/(app)/settings/team/${id}`)}
      />
      <CreateTeamSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/(app)/settings/team/${id}`)}
      />
    </View>
  );
}
