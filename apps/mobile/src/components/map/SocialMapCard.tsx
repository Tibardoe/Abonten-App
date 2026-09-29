import {
  AppText,
  Icon,
  type IoniconName,
  PressableScale,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// The card that rises from the bottom of the social map when a marker is
// tapped. It owns its whole life on screen, so every way of closing it —
// tapping the map, the X, swiping it down, the item dropping out of the
// filters — plays the same exit: SocialMap only says `open`, and keeps the
// last item around (`item`) until `onExited` says the card has gone. Tapping
// a different marker while it is up swaps the details in place with a quick
// cross-fade instead of dropping the card and raising it again.

export type SocialMapLine = {
  text: string;
  icon: IoniconName;
  /** "success" for a good state (open now); the rest read as metadata. */
  tone?: "success";
};

export type SocialMapItem = {
  id: string;
  kind: "event" | "place";
  title: string;
  imageUrl: string | null;
  point: { lat: number; lng: number };
  /** Detail lines under the title, most important first (two are shown). */
  lines: SocialMapLine[];
  /** Small trailing tag, e.g. a price or a rating. */
  tag?: string | null;
};

const ENTER_MS = 280;
const EXIT_MS = 200;
// Below its resting place by more than any card is tall.
const OFFSCREEN_EXTRA = 40;

export function SocialMapCard({
  item,
  open,
  bottom,
  onRequestClose,
  onExited,
  onHeight,
}: {
  item: SocialMapItem | null;
  open: boolean;
  /** Distance from the map's bottom edge. */
  bottom: number;
  onRequestClose: () => void;
  onExited: () => void;
  /** The card's measured height, so the map can keep a pin clear of it. */
  onHeight?: (height: number) => void;
}) {
  const router = useRouter();
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const height = useSharedValue(160);
  const translateY = useSharedValue(400);
  const detailsOpacity = useSharedValue(1);

  const [shown, setShown] = useState<SocialMapItem | null>(item);
  const pending = useRef(item);
  const shownId = useRef<string | null>(item?.id ?? null);

  const showPending = useCallback(() => {
    if (pending.current) setShown(pending.current);
    detailsOpacity.value = withTiming(1, { duration: 160 });
  }, [detailsOpacity]);

  useEffect(() => {
    pending.current = item;
    if (!item) {
      shownId.current = null;
      return;
    }
    if (shownId.current === null || shownId.current === item.id || !open) {
      shownId.current = item.id;
      setShown(item);
      return;
    }
    // Another marker while the card is up: fade the old details out, swap,
    // fade the new ones in. The card itself stays where it is.
    shownId.current = item.id;
    if (reduceMotion) {
      setShown(item);
      return;
    }
    detailsOpacity.value = withTiming(0, { duration: 90 }, (done) => {
      if (done) runOnJS(showPending)();
    });
  }, [item, open, reduceMotion, detailsOpacity, showPending]);

  useEffect(() => {
    const hidden = height.value + bottom + OFFSCREEN_EXTRA;
    if (open) {
      translateY.value = reduceMotion
        ? 0
        : withTiming(0, {
            duration: ENTER_MS,
            easing: Easing.out(Easing.cubic),
          });
      return;
    }
    if (reduceMotion) {
      translateY.value = hidden;
      onExited();
      return;
    }
    translateY.value = withTiming(
      hidden,
      { duration: EXIT_MS, easing: Easing.in(Easing.cubic) },
      (done) => {
        if (done) runOnJS(onExited)();
      },
    );
  }, [open, bottom, reduceMotion, height, translateY, onExited]);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 70 || e.velocityY > 700) {
        runOnJS(onRequestClose)();
      } else {
        translateY.value = withTiming(0, { duration: 180 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    // Fades over the last stretch, so the card doesn't cut off hard at the
    // map's bottom edge.
    opacity: interpolate(
      translateY.value,
      [0, height.value * 0.5, height.value + bottom + OFFSCREEN_EXTRA],
      [1, 0.9, 0],
      "clamp",
    ),
  }));
  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.value,
  }));

  const current = shown ?? item;
  if (!current) return null;

  const openDetails = () =>
    router.push(
      current.kind === "event"
        ? `/(app)/event/${current.id}`
        : `/(app)/place/${current.id}`,
    );

  return (
    <Animated.View
      style={[{ position: "absolute", left: 12, right: 12, bottom }, cardStyle]}
      onLayout={(e) => {
        height.value = e.nativeEvent.layout.height;
        onHeight?.(e.nativeEvent.layout.height);
      }}
    >
      <GestureDetector gesture={pan}>
        <PressableScale
          activeScale={0.98}
          accessibilityLabel={`Open ${current.title}`}
          accessibilityHint="Shows the full details"
          onPress={openDetails}
          className="rounded-3xl border border-border bg-card px-3 pb-3 pt-2"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          {/* Grabber: the card can be swiped down. */}
          <View className="items-center pb-2">
            <View className="h-1 w-9 rounded-full bg-border" />
          </View>

          <Animated.View style={detailsStyle} className="flex-row gap-3">
            <View className="h-[92px] w-[92px] overflow-hidden rounded-2xl bg-muted">
              {current.imageUrl ? (
                <Image
                  source={{ uri: current.imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Icon
                    name={
                      current.kind === "event"
                        ? "ticket-outline"
                        : "storefront-outline"
                    }
                    size={24}
                    tone="muted"
                  />
                </View>
              )}
            </View>

            <View className="flex-1 gap-1">
              <View className="flex-row items-start gap-2">
                <AppText
                  variant="cardTitle"
                  numberOfLines={2}
                  className="flex-1"
                >
                  {current.title}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={10}
                  onPress={onRequestClose}
                  className="-mr-0.5 h-7 w-7 items-center justify-center rounded-full bg-muted active:opacity-70"
                >
                  <Icon name="close" size={16} tone="foreground" />
                </Pressable>
              </View>

              {current.lines.slice(0, 2).map((line) => (
                <View
                  key={`${line.icon}:${line.text}`}
                  className="flex-row items-center gap-1.5"
                >
                  <Icon
                    name={line.icon}
                    size={14}
                    tone={line.tone === "success" ? "success" : "muted"}
                  />
                  <AppText
                    variant="meta"
                    tone={line.tone === "success" ? "success" : "muted"}
                    numberOfLines={1}
                    className="flex-1"
                  >
                    {line.text}
                  </AppText>
                </View>
              ))}

              <View className="mt-1 flex-row items-center justify-between">
                {current.tag ? (
                  <View className="rounded-full bg-muted px-2.5 py-1">
                    <AppText variant="caption" className="font-semibold">
                      {current.tag}
                    </AppText>
                  </View>
                ) : (
                  <View />
                )}
                <View className="flex-row items-center gap-0.5">
                  <AppText
                    variant="small"
                    tone="brand"
                    className="font-semibold"
                  >
                    {current.kind === "event" ? "View event" : "View place"}
                  </AppText>
                  <Icon
                    name="chevron-forward"
                    size={15}
                    color={c["primary-text"]}
                  />
                </View>
              </View>
            </View>
          </Animated.View>
        </PressableScale>
      </GestureDetector>
    </Animated.View>
  );
}
