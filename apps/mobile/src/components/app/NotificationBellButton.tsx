import { useSession } from "@/auth/SessionProvider";
import {
  flattenNotifications,
  useNotifications,
} from "@/features/notifications/useNotifications";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Native echo of the web NotificationBell trigger: an icon with an unread
// count badge, sitting in the header. Tapping opens the notifications
// screen (the web version opens a dropdown; a full screen is the native
// equivalent and the mobile app already has app/(app)/notifications.tsx).
export function NotificationBellButton() {
  const { session } = useSession();
  const router = useRouter();
  const c = useThemeColors();
  const q = useNotifications({ enabled: !!session });

  if (!session) return null;

  const unread = flattenNotifications(q.data?.pages).filter(
    (n) => !n.read_at,
  ).length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      hitSlop={8}
      onPress={() => router.push("/(app)/notifications")}
      style={{ paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <View>
        <Icon name="notifications-outline" size={22} tone="foreground" />
        {unread > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -6,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 3,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.destructive,
            }}
          >
            <AppText
              className="text-[10px] font-semibold"
              style={{ color: c["destructive-foreground"] }}
            >
              {unread > 9 ? "9+" : unread}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
