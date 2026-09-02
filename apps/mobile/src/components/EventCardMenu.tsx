import { useSession } from "@/auth/SessionProvider";
import {
  useIsFavorited,
  useToggleFavorite,
} from "@/features/favorites/useFavorites";
import { setPendingRedirect } from "@/lib/authRedirect";
import { eventShareUrl, shareLink } from "@/lib/share";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { Pressable, View } from "react-native";

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
            shareLink(event.title, eventShareUrl(event.event_code));
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
