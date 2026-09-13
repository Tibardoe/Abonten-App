import { useSession } from "@/auth/SessionProvider";
import {
  useSubscriptionStatus,
  useToggleSubscription,
} from "@/features/alerts/useAlerts";
import { useDiscoveryProgram } from "@/features/discovery/useDiscoveryProgram";
import { setPendingRedirect } from "@/lib/authRedirect";
import { hapticSelection } from "@/lib/haptics";
import { AppText, Icon } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { Pressable } from "react-native";

// The private "Notify me" bell for an organizer or a place. No public
// follower count: it only means "tell me when they post something new".
// Hidden while alerts aren't available; signed-out taps go to sign-in.
export function SubscribeBell({
  kind,
  targetId,
  ownerId,
  label,
  compact = false,
  onSurface = false,
  source = "profile",
}: {
  kind: "organizer" | "place";
  targetId: string | undefined;
  ownerId?: string | null;
  label: string;
  compact?: boolean;
  onSurface?: boolean;
  /** Where the bell is shown, recorded on the subscription for analytics. */
  source?: "profile" | "search";
}) {
  const { session } = useSession();
  const { program } = useDiscoveryProgram();
  const router = useRouter();
  const pathname = usePathname();
  const status = useSubscriptionStatus(kind, targetId);
  const toggle = useToggleSubscription(kind, targetId, label, source);

  if (!program.personalization || !targetId) return null;
  if (session && ownerId && session.user.id === ownerId) return null;

  const on = !!status.data?.subscribed;

  const onPress = () => {
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    hapticSelection();
    toggle.mutate({
      next: !on,
      subscriptionId: status.data?.subscriptionId ?? null,
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy: toggle.isPending }}
      accessibilityLabel={
        on
          ? `Notifying you about new posts from ${label}`
          : `Notify me about new posts from ${label}`
      }
      hitSlop={8}
      disabled={toggle.isPending}
      onPress={onPress}
      className={
        compact
          ? "h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          : `h-10 flex-row items-center gap-1.5 rounded-full border px-4 active:opacity-80 ${
              on ? "border-primary bg-primary/10" : "border-border bg-card"
            }`
      }
      style={
        compact && onSurface
          ? { backgroundColor: "rgba(17,24,32,0.55)" }
          : undefined
      }
    >
      <Icon
        name={on ? "notifications" : "notifications-outline"}
        size={compact ? 20 : 18}
        color={compact && onSurface ? "#fff" : undefined}
        tone={compact && onSurface ? undefined : on ? "primary" : "foreground"}
      />
      {compact ? null : (
        <AppText variant="label" tone={on ? "brand" : "primary"}>
          {on ? "Notifying" : "Notify me"}
        </AppText>
      )}
    </Pressable>
  );
}
