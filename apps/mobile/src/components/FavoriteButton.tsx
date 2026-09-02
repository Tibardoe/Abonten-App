import { useSession } from "@/auth/SessionProvider";
import {
  useIsFavorited,
  useToggleFavorite,
} from "@/features/favorites/useFavorites";
import { setPendingRedirect } from "@/lib/authRedirect";
import { hapticSelection } from "@/lib/haptics";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Icon } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { useRef } from "react";
import { Animated, Pressable } from "react-native";

// Native echo of the web AddToFavoriteButton / AddPlaceToFavoriteButton —
// an optimistic heart toggle. Signed-out taps route to sign-in (and replay
// back here after), mirroring the web useRequireAuth() gate. Filled red
// heart = favourited. A short spring "pop" + selection haptic confirms the
// tap; both are skipped under the OS reduce-motion setting.

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
  const reducedMotion = useReducedMotion();
  const favorited = useIsFavorited(kind, id).data ?? false;
  const toggle = useToggleFavorite(kind, id);
  const scale = useRef(new Animated.Value(1)).current;

  function pop() {
    if (reducedMotion) return;
    scale.stopAnimation();
    scale.setValue(0.8);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }

  function onPress() {
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    if (!toggle.isPending) {
      hapticSelection();
      pop();
      toggle.mutate(!favorited);
    }
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
          ? "h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          : "p-1 active:opacity-70"
      }
      style={onSurface ? { backgroundColor: "rgba(17,24,32,0.55)" } : undefined}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon
          name={favorited ? "heart" : "heart-outline"}
          size={size}
          color={favorited ? "#ef4444" : onSurface ? "#fff" : undefined}
          tone={favorited || onSurface ? undefined : "foreground"}
        />
      </Animated.View>
    </Pressable>
  );
}
