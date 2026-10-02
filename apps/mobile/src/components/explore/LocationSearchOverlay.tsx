import type { PlacePrediction } from "@/features/discovery/usePlacesAutocomplete";
import {
  AppText,
  Button,
  Icon,
  type IoniconName,
  KeyboardInsetView,
  Skeleton,
  useKeyboardHeight,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Portal } from "@gorhom/portal";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The location sheet's search, full screen. Typing inside the sheet left the
// field half under the keyboard and the suggestions wholly under it (the
// sheet sits in the bottom 62% of the screen and deliberately does not rise).
// Here the field is at the top, the suggestions fill the space below it and
// end at the keyboard, and "Use my current location" / "Choose on map" wait
// in that space until something is typed — the pattern people know from
// ride and map apps.
//
// It renders through the app's portal, like the sheet under it, so the
// keyboard is read on the UI thread (KeyboardInsetView) — never an RN <Modal>
// (see useKeyboardLift.ts). Back, the arrow or the hardware key, returns to
// the sheet; with the keyboard up the first Back only closes the keyboard.

export type LocationSearchError = { message: string; settings?: boolean };

const ENTER_MS = 220;
const EXIT_MS = 160;

export function LocationSearchOverlay({
  open,
  onClose,
  query,
  onQueryChange,
  predictions,
  loading,
  pickingId,
  busy,
  error,
  followingNow,
  onPick,
  onSubmitTyped,
  onUseCurrent,
  onChooseOnMap,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (text: string) => void;
  predictions: PlacePrediction[];
  /** Suggestions for the current text are on their way. */
  loading: boolean;
  /** The suggestion being resolved, if any. */
  pickingId: string | null;
  busy: "typed" | "current" | "pick" | null;
  error: LocationSearchError | null;
  /** The area already follows the phone. */
  followingNow: boolean;
  onPick: (placeId: string) => void;
  onSubmitTyped: () => void;
  onUseCurrent: () => void;
  onChooseOnMap: () => void;
}) {
  const t = useTranslations("explore");

  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const kbHeight = useKeyboardHeight();
  const inputRef = useRef<TextInput>(null);
  const [mounted, setMounted] = useState(open);
  const presence = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);
  useEffect(() => {
    if (open) {
      setMounted(true);
      presence.value = withTiming(1, {
        duration: reduceMotion ? 0 : ENTER_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    Keyboard.dismiss();
    presence.value = withTiming(
      0,
      { duration: reduceMotion ? 0 : EXIT_MS, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(unmount)();
      },
    );
  }, [open, reduceMotion, presence, unmount]);

  // Registered after the sheet's own handler — and again whenever the
  // keyboard changes, because the sheet re-registers then too — so Back
  // reaches this screen first.
  useEffect(() => {
    if (!mounted || !open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (kbHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [mounted, open, kbHeight, onClose]);

  const style = useAnimatedStyle(() => ({
    opacity: presence.value,
    transform: [{ translateY: (1 - presence.value) * 16 }],
  }));

  if (!mounted) return null;

  const trimmed = query.trim();
  const typing = trimmed.length > 0;
  const waitingForSuggestions =
    loading && predictions.length === 0 && trimmed.length >= 3;

  return (
    <Portal>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: c.background,
          },
          style,
        ]}
      >
        <View
          style={{ paddingTop: insets.top + 8 }}
          className="border-b border-border px-4 pb-3"
        >
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("back")}
              hitSlop={8}
              onPress={onClose}
              className="-ml-2 h-11 w-10 items-center justify-center active:opacity-60"
            >
              <Icon name="arrow-back" size={22} tone="foreground" />
            </Pressable>
            <View className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
              <Icon name="search-outline" size={18} tone="muted" />
              <TextInput
                ref={inputRef}
                autoFocus
                placeholder={t("searchACityTownOrAddress")}
                placeholderTextColor={c["muted-foreground"]}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                value={query}
                onChangeText={onQueryChange}
                onSubmitEditing={onSubmitTyped}
                accessibilityLabel={t("searchACityTownOrAddress")}
                className="flex-1 text-[15px] text-foreground"
                style={family.body ? { fontFamily: family.body } : undefined}
              />
              {query.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("clear")}
                  hitSlop={10}
                  onPress={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                  className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
                >
                  <Icon name="close-circle" size={18} tone="muted" />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <KeyboardInsetView>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerClassName="px-4 pt-2"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            {error ? (
              <View className="mb-2 mt-1 gap-2 rounded-xl bg-muted px-3 py-3">
                <View className="flex-row items-start gap-2">
                  <Icon name="alert-circle" size={18} tone="destructive" />
                  <AppText variant="small" className="flex-1">
                    {error.message}
                  </AppText>
                </View>
                {error.settings ? (
                  <View className="flex-row pl-6">
                    <Button
                      title={t("openSettings")}
                      variant="outline"
                      size="sm"
                      onPress={() => Linking.openSettings()}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {typing ? (
              <>
                {predictions.map((p) => (
                  <ResultRow
                    key={p.placeId}
                    icon="location-outline"
                    title={p.primary}
                    subtitle={p.secondary}
                    busy={pickingId === p.placeId}
                    disabled={busy !== null}
                    onPress={() => onPick(p.placeId)}
                  />
                ))}
                {waitingForSuggestions ? <SuggestionSkeletons /> : null}
                {trimmed.length < 3 ? (
                  <AppText variant="meta" className="px-1 pb-1 pt-3">
                    {t("keepTypingToSeePlaces")}
                  </AppText>
                ) : null}
                <View className="mt-1 border-t border-border pt-1">
                  <ResultRow
                    icon="search-outline"
                    title={t("searchFor", { trimmed: trimmed })}
                    subtitle={t("useTheAddressAsYouTyped")}
                    busy={busy === "typed"}
                    disabled={busy !== null}
                    onPress={onSubmitTyped}
                  />
                </View>
              </>
            ) : (
              <>
                <ResultRow
                  icon="navigate"
                  accent
                  title={
                    busy === "current"
                      ? t("findingYou")
                      : t("useMyCurrentLocation")
                  }
                  subtitle={
                    followingNow
                      ? t("alreadyFollowingYouAsYouMove")
                      : t("followsYouAsYouMove")
                  }
                  busy={busy === "current"}
                  disabled={busy !== null}
                  onPress={onUseCurrent}
                />
                <ResultRow
                  icon="map-outline"
                  accent
                  title={t("chooseOnMap")}
                  subtitle={t("moveTheMapUnderThePin")}
                  disabled={busy !== null}
                  onPress={onChooseOnMap}
                />
              </>
            )}
          </ScrollView>
        </KeyboardInsetView>
      </Animated.View>
    </Portal>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  accent,
  busy,
  disabled,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  /** A quick action (brand-tinted icon) rather than a search result. */
  accent?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 rounded-lg px-1 py-2 active:opacity-70"
      style={disabled && !busy ? { opacity: 0.5 } : undefined}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          accent ? "bg-accent" : "bg-muted"
        }`}
      >
        <Icon name={icon} size={18} tone={accent ? "primary" : "muted"} />
      </View>
      <View className="flex-1">
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {busy ? <ActivityIndicator size="small" /> : null}
    </Pressable>
  );
}

function SuggestionSkeletons() {
  return (
    <View className="gap-4 px-1 pt-3">
      {["a", "b", "c"].map((k) => (
        <View key={k} className="flex-row items-center gap-3">
          <Skeleton width={40} height={40} radius={20} />
          <View className="flex-1 gap-1.5">
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}
