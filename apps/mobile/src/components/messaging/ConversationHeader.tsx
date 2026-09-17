import type { ConversationContext } from "@abonten/api-client";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Rect } from "./contextMenu/menuPlacement";
import { useAnchorMeasure } from "./contextMenu/useAnchorMeasure";

const HEIGHT = 54;

// Chat-screen header: back · who you're talking to, and what about · menu.
//
// The person leads when there is one (their avatar and name), with the
// subject — "Event · Accra after dark" — on the line beneath; a support
// thread or one with no other participant yet leads with the subject. That
// second line turns into live status when there is some: "typing…" while
// they type, "In this chat" while they have the thread open. Status is
// always words (plus a dot), never colour alone. Tapping the title opens the
// event or place the conversation is about.
export function ConversationHeader({
  context,
  currentUserId,
  onMenu,
  typing = false,
  present = false,
}: {
  context: ConversationContext | null | undefined;
  currentUserId: string | undefined;
  onMenu: (anchor: Rect | null) => void;
  /** The other participant is typing right now. */
  typing?: boolean;
  /** The other participant has this conversation open right now. */
  present?: boolean;
}) {
  const { ref: menuRef, measure: measureMenu } = useAnchorMeasure();
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
  const otherName =
    context?.type !== "support"
      ? other?.profile?.full_name || other?.profile?.username || null
      : null;
  const title = otherName ?? subjectName;
  // A direct conversation (opened by a Story reply) has no event or place;
  // its stored title is only the organizer's name, which would repeat the
  // title on one side and name yourself on the other.
  const about = otherName
    ? context?.type === "direct"
      ? ""
      : contextLine
        ? `${contextLine} · ${subjectName}`
        : subjectName
    : contextLine;
  const closedNote = context?.status === "closed" ? " · Closed" : "";

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
          accessibilityLabel={[
            title,
            typing ? "typing" : present ? "in this chat" : about,
          ]
            .filter(Boolean)
            .join(", ")}
          accessibilityHint={
            subjectTappable
              ? `Opens the ${context?.subject.event ? "event" : "place"}`
              : undefined
          }
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
                      : context?.type === "direct"
                        ? "person-outline"
                        : "calendar-outline"
                }
                size={17}
                tone="muted"
              />
            </View>
          )}
          <View className="flex-1">
            <AppText variant="bodyStrong" numberOfLines={1}>
              {title}
            </AppText>
            {typing ? (
              <AppText
                variant="caption"
                tone="brand"
                numberOfLines={1}
                className="font-semibold"
                accessibilityLiveRegion="polite"
              >
                typing…
              </AppText>
            ) : present ? (
              <View className="flex-row items-center gap-1.5">
                <View
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.success }}
                />
                <AppText variant="caption" numberOfLines={1}>
                  In this chat
                </AppText>
              </View>
            ) : about || closedNote ? (
              <AppText variant="caption" numberOfLines={1}>
                {about}
                {closedNote}
              </AppText>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          ref={menuRef}
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          accessibilityHint="Opens mute, archive and report"
          hitSlop={8}
          // Hand the caller this button's own frame so the menu can hang off
          // it instead of arriving from the bottom of the screen.
          onPress={() => {
            measureMenu().then((rect) => onMenu(rect));
          }}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="ellipsis-vertical" size={20} tone="foreground" />
        </Pressable>
      </View>
    </View>
  );
}
