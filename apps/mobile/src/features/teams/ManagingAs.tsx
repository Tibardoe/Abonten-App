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
 * On the publish screens: says the listing goes out as the team, with a way
 * back to the person's own account.
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
