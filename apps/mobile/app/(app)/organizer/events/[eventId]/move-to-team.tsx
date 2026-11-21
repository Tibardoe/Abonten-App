import {
  useMoveEventToTeam,
  useMoveEventToTeamOptions,
} from "@/features/teams/useMoveEventToTeam";
import { useSwitchActingTeam } from "@/features/teams/useTeams";
import { AppText, Button, Chip, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

// "Move to a team" (docs/architecture/team-accounts.md, "Move events into a
// team"): an Owner of a team moves one of their own events, with every
// show of its run, into the team so its members can manage it too. Only
// while nobody has bought or registered. Mirrors the website's
// Manage › Details card; /api/mobile/organizer/events/:id/move-to-team.
export default function MoveEventToTeamScreen() {
  const t = useTranslations("events");
  const toast = useToast();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const options = useMoveEventToTeamOptions(id);
  const move = useMoveEventToTeam(id);
  const switchTeam = useSwitchActingTeam();
  const [chosen, setChosen] = useState<string | null>(null);

  const data =
    options.data?.status === 200 && "data" in options.data
      ? options.data.data
      : null;
  const teams = data?.teams ?? [];
  const team = teams.find((x) => x.id === chosen) ?? teams[0] ?? null;
  const teamName = team ? (team.name ?? `@${team.username ?? ""}`) : "";

  const confirmMove = () => {
    if (!team || !data) return;
    Alert.alert(
      t("moveToTeamConfirm", { count: data.eventCount, team: teamName }),
      undefined,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("moveToTeamButton", { team: teamName }),
          onPress: () =>
            move.mutate(team.id, {
              onSettled: (res) => {
                if (res?.status === 200) {
                  toast.success(res.message ?? "");
                  // The event is the team's now: manage it as the team.
                  switchTeam({
                    teamId: team.id,
                    name: team.name,
                    role: "owner",
                  });
                  router.back();
                  return;
                }
                toast.error(res?.message ?? "");
              },
            }),
        },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
    >
      <Stack.Screen options={{ title: t("moveToTeamTitle") }} />
      <AppText variant="muted">{t("moveToTeamIntro")}</AppText>

      {options.isPending ? (
        <ActivityIndicator />
      ) : !data ? (
        options.data?.message ? (
          <AppText variant="small" tone="error">
            {options.data.message}
          </AppText>
        ) : null
      ) : data.hasSales ? (
        <AppText variant="small">{t("moveToTeamHasSales")}</AppText>
      ) : (
        <View className="gap-4">
          <AppText variant="small">
            {t("moveToTeamRun", { count: data.eventCount })}
          </AppText>
          {teams.length > 1 ? (
            <View className="gap-2">
              <AppText variant="label">{t("moveToTeamChoose")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {teams.map((x) => (
                  <Chip
                    key={x.id}
                    label={x.name ?? `@${x.username ?? ""}`}
                    selected={x.id === team?.id}
                    onPress={() => setChosen(x.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {team ? (
            <Button
              title={t("moveToTeamButton", { team: teamName })}
              disabled={move.isPending}
              onPress={confirmMove}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
