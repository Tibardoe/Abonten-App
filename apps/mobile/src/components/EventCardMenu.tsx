import { useSession } from "@/auth/SessionProvider";
import { ReminderOptionsSheet } from "@/components/reminders/ReminderOptionsSheet";
import {
  useIsFavorited,
  useToggleFavorite,
} from "@/features/favorites/useFavorites";
import { useEventReminder } from "@/features/reminders/useEventReminder";
import { setPendingRedirect } from "@/lib/authRedirect";
import { shareEvent } from "@/lib/share";
import type { Occurrence } from "@abonten/types/occurrenceType";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";

function toIso(v: string | Date | undefined | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

// Reminder needs a concrete start time; specific-date events have starts_at
// null, so fall back to the next upcoming occurrence (else the first).
function reminderStart(event: UserPostType): string | null {
  const direct = toIso(event.starts_at);
  if (direct) return direct;
  const occ: Occurrence[] = event.occurrences ?? event.event_occurrence ?? [];
  const now = Date.now();
  const times = occ
    .map((o) => toIso(o.starts_at))
    .filter((s): s is string => !!s)
    .sort();
  return times.find((s) => new Date(s).getTime() > now) ?? times[0] ?? null;
}

// Own the useEventReminder instance only when the menu can actually show the
// row (hooks can't be conditional, so this is a child rather than an inline
// branch).
function ReminderMenuRow({
  event,
  startsAtIso,
  onClose,
}: {
  event: UserPostType;
  startsAtIso: string;
  onClose: () => void;
}) {
  const { offsets, saving, save } = useEventReminder(
    event.id,
    startsAtIso,
    event.status,
    event.title,
  );
  const [open, setOpen] = useState(false);
  const active = offsets.length > 0;

  async function onSave(draft: number[]) {
    const res = await save(draft, { eventTitle: event.title, startsAtIso });
    if (res.ok) {
      setOpen(false);
      onClose();
      return;
    }
    if (res.reason === "permission") {
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for Abonten to get event reminders.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open settings", onPress: () => Linking.openSettings() },
        ],
      );
    }
  }

  async function onTurnOff() {
    await save([], { eventTitle: event.title, startsAtIso });
    setOpen(false);
    onClose();
  }

  return (
    <>
      <MenuRow
        icon={active ? "notifications" : "notifications-outline"}
        label={active ? "Reminder set" : "Set reminder"}
        onPress={() => setOpen(true)}
      />
      <ReminderOptionsSheet
        open={open}
        onClose={() => setOpen(false)}
        offsets={offsets}
        saving={saving}
        onSave={onSave}
        onTurnOff={onTurnOff}
      />
    </>
  );
}

// The mobile EventCard contextual menu — the native echo of the web
// EventCardMenuModal (Radix dropdown). Same actions, same permission gates:
// Favourite + Share for everyone; Edit / Manage promo codes / Cancel for the
// organiser only, and a "cancelled" note in place of Cancel once it is.
// (The web "Delete event" item has no mobile destination yet, so it's
// omitted rather than faked.)

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[48px] flex-row items-center gap-3 rounded-lg px-1 py-3 active:opacity-70"
    >
      <Icon
        name={icon}
        size={20}
        tone={destructive ? "destructive" : "foreground"}
      />
      <AppText
        variant="body"
        tone={destructive ? "error" : "primary"}
        className="flex-1"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function EventCardMenu({
  event,
  open,
  onClose,
}: {
  event: UserPostType;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const favorited = useIsFavorited("event", event.id).data ?? false;
  const toggle = useToggleFavorite("event", event.id);

  const isOrganizer = !!session && session.user.id === event.organizer_id;
  const isCancelled = event.status === "canceled";
  const remindStart = reminderStart(event);
  const canRemind =
    !isCancelled &&
    !!remindStart &&
    new Date(remindStart).getTime() > Date.now();

  function requireAuth(): boolean {
    if (session) return true;
    if (pathname) setPendingRedirect(pathname);
    onClose();
    router.push("/(auth)/sign-in");
    return false;
  }

  function go(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <Sheet open={open} onClose={onClose} title={event.title}>
      <View className="gap-1">
        {canRemind && remindStart ? (
          <ReminderMenuRow
            event={event}
            startsAtIso={remindStart}
            onClose={onClose}
          />
        ) : null}
        <MenuRow
          icon={favorited ? "heart" : "heart-outline"}
          label={favorited ? "Remove from favourites" : "Add to favourites"}
          onPress={() => {
            if (!requireAuth()) return;
            toggle.mutate(!favorited);
            onClose();
          }}
        />
        <MenuRow
          icon="share-outline"
          label="Share"
          onPress={() => {
            onClose();
            shareEvent(event.title, event.event_code);
          }}
        />

        {isOrganizer ? (
          <>
            <View className="my-1 h-px bg-border" />
            <MenuRow
              icon="create-outline"
              label="Edit event"
              onPress={() => go(`/(app)/organizer/events/${event.id}/edit`)}
            />
            {isCancelled ? (
              <AppText variant="muted" className="px-1 py-2">
                This event has been cancelled
              </AppText>
            ) : (
              <>
                <MenuRow
                  icon="pricetag-outline"
                  label="Manage promo codes"
                  onPress={() =>
                    go(`/(app)/organizer/events/${event.id}/promo-codes`)
                  }
                />
                <MenuRow
                  icon="close-circle-outline"
                  label="Cancel event"
                  destructive
                  onPress={() => {
                    onClose();
                    router.push({
                      pathname: "/(app)/organizer/cancel-event",
                      params: { eventId: event.id, title: event.title },
                    });
                  }}
                />
              </>
            )}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
