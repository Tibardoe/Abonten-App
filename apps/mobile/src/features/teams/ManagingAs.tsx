import { teamRoleCan } from "@abonten/core/teams/roles";
import { AppText, Chip, Icon, Overline } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { useActingTeams, useSwitchActingTeam } from "./useTeams";

// "Managing as" for the organizer screens (docs/architecture/team-accounts.md,
// stage 2): the person's own account or one of their teams. Shown only to
// people who are in a team.

/** The choice at the top of Organizer. */
export function ManagingAsCard() {
  const t = useTranslations("teams");
  const { teams, current } = useActingTeams();
  const switchTo = useSwitchActingTeam();
  if (teams.length === 0 && !current) return null;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Overline>{t("managingAs")}</Overline>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          label={t("yourAccount")}
          selected={!current}
          onPress={() => switchTo(null)}
        />
        {current && !teams.some((team) => team.id === current.teamId) ? (
          // The remembered team, until the list arrives from the server.
          <Chip label={current.name ?? ""} selected />
        ) : null}
        {teams.map((team) => (
          <Chip
            key={team.id}
            label={team.name ?? `@${team.username ?? ""}`}
            selected={current?.teamId === team.id}
            onPress={() =>
              switchTo({ teamId: team.id, name: team.name, role: team.role })
            }
          />
        ))}
      </View>
      {current ? (
        <View className="gap-0.5">
          <AppText variant="caption">{t("yourRole")}</AppText>
          <AppText variant="bodyStrong">
            {t("role", { role: current.role })}
          </AppText>
          <AppText variant="meta">
            {t("roleHelp", { role: current.role })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * On the event and place create screens: who the listing goes out as.
 * Shown to anyone in a team whose role covers publishing it, and to anyone
 * managing as a team, so a listing never lands on the wrong account
 * unnoticed (it happened: twelve events on an organizer's own account that
 * his team could not manage). The choices are the person's own account and
 * each such team. `locked` (a resumed draft, or an event started from a
 * place's page): the account is already decided, so it is only shown.
 * `disabled`: while publishing.
 */
export function PublishingAsChooser({
  capability,
  locked = false,
  disabled = false,
}: {
  capability: "events.manage" | "places.manage";
  locked?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("teams");
  const { teams, current } = useActingTeams();
  const switchTo = useSwitchActingTeam();
  const eligible = teams.filter((team) => teamRoleCan(team.role, capability));
  if (!current && eligible.length === 0) return null;

  const currentCovers = !current || teamRoleCan(current.role, capability);
  const canSwitch = !locked && !disabled;
  // The remembered team, until the list arrives from the server.
  const remembered =
    current && currentCovers && !teams.some((tm) => tm.id === current.teamId);

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <Overline>{t("publishingAsLabel")}</Overline>
      <View className="flex-row flex-wrap gap-2">
        {!locked || !current ? (
          <Chip
            label={t("yourAccount")}
            selected={!current}
            onPress={canSwitch ? () => switchTo(null) : undefined}
          />
        ) : null}
        {remembered ? <Chip label={current.name ?? ""} selected /> : null}
        {eligible
          .filter((team) => !locked || current?.teamId === team.id)
          .map((team) => (
            <Chip
              key={team.id}
              label={team.name ?? `@${team.username ?? ""}`}
              selected={current?.teamId === team.id}
              onPress={
                canSwitch
                  ? () =>
                      switchTo({
                        teamId: team.id,
                        name: team.name,
                        role: team.role,
                      })
                  : undefined
              }
            />
          ))}
      </View>
      {!currentCovers ? (
        <AppText variant="small" tone="error">
          {t("publishingAsRoleCannot", { team: current?.name ?? "" })}
        </AppText>
      ) : !locked ? (
        <AppText variant="meta">{t("publishingAsHint")}</AppText>
      ) : null}
    </View>
  );
}

/**
 * On the Spotlight and Story screens: says the post goes out as the team,
 * with a way back to the person's own account.
 */
export function PublishingAsBanner() {
  const t = useTranslations("teams");
  const { current } = useActingTeams();
  const switchTo = useSwitchActingTeam();
  if (!current) return null;

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Icon name="people-outline" size={18} tone="primary" />
      <AppText variant="small" className="flex-1">
        {t("publishingAs", { name: current.name ?? "" })}
      </AppText>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => switchTo(null)}
        className="active:opacity-70"
      >
        <AppText variant="small" tone="brand" className="font-semibold">
          {t("useOwnAccount")}
        </AppText>
      </Pressable>
    </View>
  );
}

/** One row of the team panels (Organizer, an event, a place). */
export function TeamNavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
        <AppText className="text-base text-foreground">{label}</AppText>
        <AppText className="text-muted-foreground">›</AppText>
      </Pressable>
    </Link>
  );
}

/**
 * A screen opened (from a link, say) while managing as a team whose role
 * does not cover it: says so, instead of showing figures it could not read,
 * and offers the person's own account.
 */
export function TeamRoleBlocked() {
  const t = useTranslations("teams");
  const switchTo = useSwitchActingTeam();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Icon name="lock-closed-outline" size={28} tone="muted" />
      <AppText variant="muted" className="text-center">
        {t("roleDoesNotCover")}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => switchTo(null)}
        className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
      >
        <AppText className="font-semibold text-primary-foreground">
          {t("useOwnAccount")}
        </AppText>
      </Pressable>
    </View>
  );
}

/**
 * Over the inbox while it is a team's (managing as a team whose messages
 * the person answers): says whose it is, with the way back to their own.
 */
export function TeamInboxBanner() {
  const t = useTranslations("teams");
  const { current } = useActingTeams();
  const switchTo = useSwitchActingTeam();
  if (!current || !teamRoleCan(current.role, "messages.reply")) return null;
  return (
    <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Icon name="people-outline" size={18} tone="primary" />
      <AppText variant="small" className="flex-1" numberOfLines={2}>
        {t("teamInbox", { team: current.name ?? "" })}
      </AppText>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => switchTo(null)}
        className="active:opacity-70"
      >
        <AppText variant="small" tone="brand" className="font-semibold">
          {t("useOwnAccount")}
        </AppText>
      </Pressable>
    </View>
  );
}
