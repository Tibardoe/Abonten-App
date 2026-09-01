import { useSession } from "@/auth/SessionProvider";
import {
  useIsFavorited,
  useToggleFavorite,
} from "@/features/favorites/useFavorites";
import { setPendingRedirect } from "@/lib/authRedirect";
import { Icon } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { Pressable } from "react-native";

// Native echo of the web AddToFavoriteButton / AddPlaceToFavoriteButton —
// an optimistic heart toggle. Signed-out taps route to sign-in (and replay
// back here after), mirroring the web useRequireAuth() gate. Filled red
// heart = favourited.

export function FavoriteButton({
  kind,
  id,
  size = 22,
  onSurface = false,
}: {
  kind: "event" | "place";
  id: string | undefined;
  size?: number;
  /** true when placed over a photo — uses a translucent chip for contrast. */
  onSurface?: boolean;
}) {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const favorited = useIsFavorited(kind, id).data ?? false;
  const toggle = useToggleFavorite(kind, id);

  function onPress() {
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    if (!toggle.isPending) toggle.mutate();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        favorited ? "Remove from favourites" : "Add to favourites"
      }
      accessibilityState={{ selected: favorited }}
      hitSlop={8}
      onPress={onPress}
      disabled={toggle.isPending}
      className={
        onSurface
          ? "h-9 w-9 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
          : "p-1 active:opacity-70"
      }
    >
      <Icon
        name={favorited ? "heart" : "heart-outline"}
        size={size}
        color={favorited ? "#ef4444" : undefined}
        tone={favorited ? undefined : "foreground"}
      />
    </Pressable>
  );
}
