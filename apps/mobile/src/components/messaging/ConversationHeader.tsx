import type { ConversationContext } from "@abonten/api-client";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEIGHT = 54;

// Chat-screen header: back · tappable subject (event / place name + a
// one-word context line) · overflow menu. The subject opens the underlying
// event or place detail screen, so the conversation always stays anchored to
// what it's about.
export function ConversationHeader({
  context,
  currentUserId,
  onMenu,
}: {
  context: ConversationContext | null | undefined;
  currentUserId: string | undefined;
  onMenu: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const subjectName =
    context?.subject.event?.title ??
    context?.subject.place?.name ??
    context?.title ??
    "Conversation";

  const contextLine =
    context?.type === "event"
      ? "Event"
      : context?.type === "place"
        ? "Place"
        : context?.type === "support"
          ? "Support"
          : "";

  const other = context?.participants.find(
    (p) => p.user_id !== currentUserId && p.profile,
  );

  function openSubject() {
    if (context?.subject.event) {
      router.push(`/(app)/event/${context.subject.event.id}`);
    } else if (context?.subject.place) {
      router.push(`/(app)/place/${context.subject.place.id}`);
    }
  }

  const subjectTappable = !!context?.subject.event || !!context?.subject.place;

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: c.sidebar,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c["sidebar-border"],
      }}
    >
      <View
        style={{ height: HEIGHT }}
        className="flex-row items-center gap-1 px-1"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(app)/messages")
          }
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="arrow-back" size={24} tone="foreground" />
        </Pressable>

        <Pressable
          accessibilityRole={subjectTappable ? "button" : "header"}
          onPress={subjectTappable ? openSubject : undefined}
          className="flex-1 flex-row items-center gap-2 active:opacity-70"
        >
          {other?.profile ? (
            <Avatar
              publicId={other.profile.avatar_public_id}
              version={other.profile.avatar_version}
              size={34}
            />
          ) : (
            <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-muted">
              <Icon
                name={
                  context?.type === "place"
                    ? "storefront-outline"
                    : context?.type === "support"
                      ? "help-buoy-outline"
                      : "calendar-outline"
                }
                size={17}
                tone="muted"
              />
            </View>
          )}
          <View className="flex-1">
            <AppText variant="bodyStrong" numberOfLines={1}>
              {subjectName}
            </AppText>
            {contextLine ? (
              <AppText variant="caption" numberOfLines={1}>
                {contextLine}
                {context?.status === "closed" ? " · Closed" : ""}
              </AppText>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          hitSlop={8}
          onPress={onMenu}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="ellipsis-vertical" size={20} tone="foreground" />
        </Pressable>
      </View>
    </View>
  );
}
