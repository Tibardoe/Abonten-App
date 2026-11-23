import {
  flattenOrganizerEvents,
  useOrganizerEvents,
} from "@/features/organizer/useOrganizer";
import { useIsOrganizer } from "@/features/roles/useRoles";
import type { UserPostType } from "@abonten/api-client";
import { formatDate } from "@abonten/core/i18n/format";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// "Your events" on Home: an organizer's next published event, one tap from
// managing it. Explore is by location, so an organizer browsing from
// somewhere else saw "No events in <town>" and thought their own listing
// had gone (Meraki, 23 Nov 2026). Shown only to people who organize events
// and only while one is still to come or on now; nothing while loading or
// on a failed read (it's a shortcut, the menu's Manage › Events stays the
// way in).

type Session = { starts: number; ends: number };

function sessionsOf(event: UserPostType): Session[] {
  const occurrences =
    (event as { occurrences?: { starts_at: string; ends_at: string }[] })
      .occurrences ??
    event.event_occurrence ??
    [];
  const list = occurrences.length
    ? occurrences.map((o) => ({ starts_at: o.starts_at, ends_at: o.ends_at }))
    : event.starts_at && event.ends_at
      ? [{ starts_at: event.starts_at, ends_at: event.ends_at }]
      : [];
  return list
    .map((o) => ({
      starts: new Date(o.starts_at).getTime(),
      ends: new Date(o.ends_at).getTime(),
    }))
    .filter((s) => !Number.isNaN(s.starts) && !Number.isNaN(s.ends))
    .sort((a, b) => a.starts - b.starts);
}

type Next = { event: UserPostType; session: Session };

/** Published, not postponed or archived, with a date still to come or on. */
function upcoming(events: UserPostType[], now: number): Next[] {
  const out: Next[] = [];
  for (const event of events) {
    if (event.status !== "published" || event.postponed_at) continue;
    if ((event as { archived_at?: string | null }).archived_at) continue;
    const session = sessionsOf(event).find((s) => s.ends > now);
    if (session) out.push({ event, session });
  }
  return out.sort((a, b) => a.session.starts - b.session.starts);
}

export function YourEventsCard({ className }: { className?: string }) {
  const t = useTranslations("manage");
  const { locale } = useLocale();
  const router = useRouter();
  const isOrganizer = useIsOrganizer();
  const events = useOrganizerEvents({ enabled: isOrganizer });

  if (!isOrganizer || !events.data) return null;
  const now = Date.now();
  const list = upcoming(flattenOrganizerEvents(events.data.pages), now);
  const first = list[0];
  if (!first) return null;

  const title = first.event.title ?? "";
  const more = list.length - 1;
  const onNow = first.session.starts <= now;
  const date = formatDate(first.session.starts, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: first.event.timezone ?? undefined,
  });
  const line = onNow
    ? more > 0
      ? t("yourEventsOnNowMore", { title, count: more })
      : t("yourEventsOnNow", { title })
    : more > 0
      ? t("yourEventsNextMore", { title, date, count: more })
      : t("yourEventsNext", { title, date });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("yourEventsOpen")}
      onPress={() => router.push("/(app)/organizer/events")}
      className={`flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-80 ${className ?? ""}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
        <Icon name="calendar-outline" size={20} tone="primary" />
      </View>
      <View className="flex-1 gap-0.5">
        <AppText variant="bodyStrong">{t("yourEvents")}</AppText>
        <AppText variant="meta" numberOfLines={1}>
          {line}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}
