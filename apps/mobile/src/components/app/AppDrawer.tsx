import { useSession } from "@/auth/SessionProvider";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { useProfile } from "@/features/profile/useProfile";
import { useIsOrganizer, useIsPlaceOwner } from "@/features/roles/useRoles";
import {
  AbontenLogo,
  AppText,
  Avatar,
  Button,
  Divider,
  Icon,
  type IoniconName,
  Label,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import {
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppearanceToggle } from "./AppearanceToggle";
import { useMenuSheet } from "./menuSheet";

// Full-screen navigation drawer — the native stand-in for the web header's
// hamburger -> <SideBar> sheet. Slides in from the left. Two ways in: the
// header menu button (useMenuSheet), or an edge-swipe from the left screen
// edge; both hand off to the same shared progress value so a partial swipe
// tracks the finger and settles by distance/velocity on release. Swipe the
// open panel left, tap the backdrop, or press Android back to dismiss.
// Mounted once, always, from app/(app)/_layout.tsx as an absolute overlay so
// the edge catcher is live even while the drawer is closed; it lets touches
// through everywhere except the ~22px edge strip (closed) or the whole
// surface (open).

const WEBSITE = "https://abontenhub.com";
const OPEN_MS = 260;
const CLOSE_MS = 200;
const EDGE_WIDTH = 22;

function Row({
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
        size={22}
        tone={destructive ? "destructive" : "muted"}
      />
      <AppText
        variant="body"
        tone={destructive ? "error" : "primary"}
        className="flex-1"
      >
        {label}
      </AppText>
      {!destructive ? (
        <Icon name="chevron-forward" size={16} tone="muted" />
      ) : null}
    </Pressable>
  );
}

export function AppDrawer() {
  const { open, setOpen } = useMenuSheet();
  const { session, signOut } = useSession();
  const { data: profile } = useProfile();
  const isOrganizer = useIsOrganizer();
  const isPlaceOwner = useIsPlaceOwner();
  const router = useRouter();
  const t = useTranslations("navigation");
  const tSettings = useTranslations("settings");
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const segments = useSegments();
  // The edge-swipe-to-open only lives on the tab root screens. On a pushed
  // screen (event/place detail, organizer, settings, the wizards…) the left
  // edge belongs to the native stack's back-swipe, so opening the drawer
  // there would fight "go back". The header menu button is only on the tab
  // screens anyway.
  const onTabRoot = (segments as string[]).includes("(tabs)");

  // progress: 0 = closed, 1 = fully open. tx: panel translateX in px.
  const tx = useSharedValue(-width);
  const progress = useSharedValue(0);
  // Mirror of `open` readable on the UI thread so the edge gesture knows to
  // stand down once the drawer is already open.
  const openSV = useSharedValue(0);

  useEffect(() => {
    openSV.value = open ? 1 : 0;
    if (open) {
      tx.value = withTiming(0, {
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
      });
      progress.value = withTiming(1, { duration: OPEN_MS });
    } else {
      tx.value = withTiming(-width, {
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
      });
      progress.value = withTiming(0, { duration: CLOSE_MS });
    }
  }, [open, width, tx, progress, openSV]);

  // Android hardware back closes the drawer instead of leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open, setOpen]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  // Edge-swipe to OPEN: a rightward drag starting in the left edge strip.
  // Ignored once the drawer is already open; fails on a vertical drag so it
  // never fights a list scroll.
  const edgePan = Gesture.Pan()
    .activeOffsetX(12)
    .failOffsetX(-12)
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      if (openSV.value === 1) return;
      const dx = Math.min(width, Math.max(0, e.translationX));
      tx.value = -width + dx;
      progress.value = Math.min(dx / width, 1);
    })
    .onEnd((e) => {
      if (openSV.value === 1) return;
      const shouldOpen = e.translationX > width * 0.4 || e.velocityX > 500;
      if (shouldOpen) {
        tx.value = withTiming(0, { duration: 160 }, (finished) => {
          if (finished) runOnJS(setOpen)(true);
        });
        progress.value = withTiming(1, { duration: 160 });
      } else {
        tx.value = withTiming(-width, { duration: 160 });
        progress.value = withTiming(0, { duration: 160 });
      }
    });

  // Swipe the open panel left to CLOSE. Bails on a rightward drag so vertical
  // scrolling inside the panel is untouched.
  const closePan = Gesture.Pan()
    .activeOffsetX(-20)
    .failOffsetX(20)
    .onUpdate((e) => {
      const dx = Math.min(0, Math.max(e.translationX, -width));
      tx.value = dx;
      progress.value = 1 - Math.min(Math.abs(dx) / width, 1);
    })
    .onEnd((e) => {
      const shouldClose = e.translationX < -width * 0.3 || e.velocityX < -600;
      if (shouldClose) {
        tx.value = withTiming(-width, { duration: 160 }, (finished) => {
          if (finished) runOnJS(setOpen)(false);
        });
        progress.value = withTiming(0, { duration: 160 });
      } else {
        tx.value = withTiming(0, { duration: 160 });
        progress.value = withTiming(1, { duration: 160 });
      }
    });

  const close = () => setOpen(false);
  const go = (path: string) => {
    close();
    router.push(path);
  };
  const openWeb = () => {
    close();
    Linking.openURL(WEBSITE).catch(() => {});
  };

  return (
    // box-none: this overlay never blocks touches itself — only its
    // interactive children (edge strip / backdrop / panel) do.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Left-edge catcher — only on the tab roots, and only while closed. */}
      {!open && onTabRoot ? (
        <GestureDetector gesture={edgePan}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: EDGE_WIDTH,
            }}
          />
        </GestureDetector>
      ) : null}

      {/* Backdrop — interactive only when open. */}
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFill,
          backdropStyle,
          { backgroundColor: c.overlay },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={close}
        />
      </Animated.View>

      {/* Panel */}
      <GestureDetector gesture={closePan}>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width,
              backgroundColor: c.background,
            },
            panelStyle,
          ]}
        >
          <View
            style={{ paddingTop: insets.top }}
            className="border-b border-border"
          >
            <View className="h-[54px] flex-row items-center justify-center px-1">
              <AbontenLogo size={38} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={close}
                hitSlop={10}
                style={{
                  position: "absolute",
                  right: Math.max(insets.right, 4),
                }}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="close" size={26} tone="foreground" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 32,
            }}
            showsVerticalScrollIndicator={false}
          >
            {session ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go("/(app)/account")}
                  className="mb-2 min-h-[56px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
                >
                  <Avatar
                    publicId={profile?.avatar_public_id}
                    version={profile?.avatar_version}
                    size={44}
                  />
                  <View className="flex-1">
                    <AppText variant="bodyStrong">
                      {profile?.full_name ??
                        profile?.username ??
                        "Your account"}
                    </AppText>
                    {profile?.username ? (
                      <AppText variant="meta">@{profile.username}</AppText>
                    ) : null}
                  </View>
                  <Icon name="chevron-forward" size={16} tone="muted" />
                </Pressable>

                <Label className="mb-1 mt-3">{t("create")}</Label>
                <Row
                  icon="add-circle-outline"
                  label="Create event"
                  onPress={() => go("/(app)/event/new")}
                />
                <Row
                  icon="storefront-outline"
                  label="Create place"
                  onPress={() => go("/(app)/place/new")}
                />

                {isOrganizer || isPlaceOwner ? (
                  <Label className="mb-1 mt-3">{t("manage")}</Label>
                ) : null}
                {isOrganizer ? (
                  <>
                    <Row
                      icon="grid-outline"
                      label={t("dashboard")}
                      onPress={() => go("/(app)/organizer")}
                    />
                    <Row
                      icon="calendar-outline"
                      label={t("manageEvents")}
                      onPress={() => go("/(app)/organizer/events")}
                    />
                    <Row
                      icon="wallet-outline"
                      label={t("finances")}
                      onPress={() => go("/(app)/organizer/finance")}
                    />
                  </>
                ) : null}
                {isPlaceOwner ? (
                  <Row
                    icon="storefront-outline"
                    label="My places"
                    onPress={() => go("/(app)/organizer/places")}
                  />
                ) : null}

                <Label className="mb-1 mt-3">{t("account")}</Label>
                <Row
                  icon="receipt-outline"
                  label={t("myEvents")}
                  onPress={() => go("/(app)/tickets")}
                />
                <Row
                  icon="card-outline"
                  label={t("wallets")}
                  onPress={() => go("/(app)/wallet")}
                />
                <Row
                  icon="location-outline"
                  label={t("places")}
                  onPress={() => go("/(app)/places")}
                />
                <Row
                  icon="calendar-outline"
                  label="My bookings"
                  onPress={() => go("/(app)/bookings")}
                />
                <Row
                  icon="notifications-outline"
                  label="Notifications"
                  onPress={() => go("/(app)/notifications")}
                />
              </>
            ) : (
              <>
                <Row
                  icon="log-in-outline"
                  label={t("signIn")}
                  onPress={() => go("/(auth)/sign-in")}
                />
                <Row
                  icon="person-add-outline"
                  label={t("signUp")}
                  onPress={() => go("/(auth)/sign-in")}
                />
              </>
            )}

            <Label className="mb-2 mt-4">{tSettings("appearance.title")}</Label>
            <AppearanceToggle />

            {session ? (
              <Button
                title={t("signOut")}
                variant="outline"
                className="mt-5 border-destructive"
                onPress={async () => {
                  close();
                  await unregisterPushToken();
                  await signOut();
                }}
              />
            ) : null}

            <Divider className="my-5" />

            <View className="gap-3">
              {["Terms & Conditions", "Privacy", "Cookies", "Security"].map(
                (label) => (
                  <Pressable
                    key={label}
                    onPress={openWeb}
                    className="active:opacity-60"
                  >
                    <AppText variant="muted">{label}</AppText>
                  </Pressable>
                ),
              )}
              <AppText variant="meta" className="mt-1">
                © {new Date().getFullYear()} Abonten Hub
              </AppText>
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
