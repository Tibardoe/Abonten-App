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
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
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
// hamburger -> <SideBar> sheet. Slides in from the left toward the right,
// covers the whole screen, has a centred brand with a close control on the
// right, and can be swiped left to dismiss. Same Create / Manage / account
// links, appearance control,
// sign-out, and legal footer as the web SideBar. Mounted once from
// app/(app)/_layout.tsx; opened via the header menu button through
// useMenuSheet().

const WEBSITE = "https://abontenhub.com";
const OPEN_MS = 260;
const CLOSE_MS = 200;

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
        className={`flex-1 text-[15px] ${
          destructive ? "text-destructive" : "text-foreground"
        }`}
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

  // Keep the Modal mounted through the exit animation.
  const [mounted, setMounted] = useState(open);
  const tx = useSharedValue(-width);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      tx.value = withTiming(0, {
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
      });
      progress.value = withTiming(1, { duration: OPEN_MS });
    } else {
      tx.value = withTiming(
        -width,
        { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
      progress.value = withTiming(0, { duration: CLOSE_MS });
    }
  }, [open, width, tx, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  // Left-only pan: activate once dragged ~20px left, bail if it's a
  // rightward drag so vertical scrolling inside the panel is untouched.
  const pan = Gesture.Pan()
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

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            backdropStyle,
            { backgroundColor: c.overlay },
          ]}
        />

        <GestureDetector gesture={pan}>
          <Animated.View
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
            {/* Header: brand centred, close control on the right — a
                balanced, intentional bar (the X mirrors the web Sheet's
                close affordance). The close button is absolutely pinned so
                the logo sits at the true horizontal centre. */}
            <View
              style={{ paddingTop: insets.top }}
              className="border-b border-border"
            >
              <View className="h-12 flex-row items-center justify-center px-1">
                <AbontenLogo size={24} />
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

              <Label className="mb-2 mt-4">
                {tSettings("appearance.title")}
              </Label>
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
      </GestureHandlerRootView>
    </Modal>
  );
}
