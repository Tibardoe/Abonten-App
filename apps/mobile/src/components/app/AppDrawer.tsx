import { useSession } from "@/auth/SessionProvider";
import { useContentProgram } from "@/features/content/useContentProgram";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { useProfile } from "@/features/profile/useProfile";
import { useIsOrganizer, useIsPlaceOwner } from "@/features/roles/useRoles";
import { useWeeklyProgram } from "@/features/weekly/useWeekly";
import {
  HELP_URL,
  LEGAL_LINK_ROWS,
  openExternalLink,
  openSupportEmail,
} from "@/lib/legalLinks";
import { SUPPORT_EMAIL } from "@abonten/core/brand/contacts";
import { LEGAL_ENTITY_NAME } from "@abonten/core/brand/legalEntity";
import { SOCIAL_LINKS } from "@abonten/core/brand/socialLinks";
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
import {
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { useEffect, useRef } from "react";
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

const SOCIAL_ICON: Record<(typeof SOCIAL_LINKS)[number]["key"], IoniconName> = {
  x: "logo-x",
  instagram: "logo-instagram",
  tiktok: "logo-tiktok",
};
const OPEN_MS = 260;
const CLOSE_MS = 200;
const EDGE_WIDTH = 22;
// The branded AppHeader is insets.top + 54 tall. Start the left-edge swipe
// catcher below it so its GestureDetector never sits on top of the header's
// menu button — that overlap was swallowing taps on the button (the swipe
// still worked), so the menu "sometimes" didn't open.
const HEADER_HEIGHT = 54;

// How many screens the (app) stack holds right now — used to recognise
// "came BACK to the screen the drawer was opened over" (same path, same
// depth) as opposed to landing on that path some other way.
type NavState = {
  routes?: { name: string; state?: NavState }[];
};
function appStackDepth(state: NavState | undefined): number {
  const app = state?.routes?.find((r) => r.name === "(app)");
  return app?.state?.routes?.length ?? 0;
}

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
  const { program: weekly } = useWeeklyProgram();
  const { program: content } = useContentProgram();
  const router = useRouter();
  const t = useTranslations("navigation");
  const tSettings = useTranslations("settings");
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const pathname = usePathname();
  const rootState = useRootNavigationState() as NavState | undefined;
  const depth = appStackDepth(rootState);
  const depthRef = useRef(depth);
  depthRef.current = depth;
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
      returnTo.current = null;
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open, setOpen]);

  // The drawer is mounted once above the whole stack, so it is not torn down
  // by navigation. If the route changes for any reason while it is open — a
  // push notification tap, a deep link, a tab press landing under the panel
  // — the panel would otherwise stay up over the new screen. Any route
  // change closes it, and the edge-swipe progress is reset with it so a
  // half-dragged panel can't be left hanging either.
  //
  // The one exception is coming BACK from a screen the drawer itself opened
  // (Dashboard, Wallets, Notifications…): the drawer is a navigation context,
  // so returning from one of its destinations lands on the drawer again,
  // not on the screen underneath it. Closing the drawer explicitly (X,
  // backdrop, swipe, Android back) forgets that and reveals the screen.
  const returnTo = useRef<{ path: string; depth: number } | null>(null);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const origin = returnTo.current;
    if (origin && pathname === origin.path && depth === origin.depth) {
      returnTo.current = null;
      setOpen(true);
      return;
    }
    // Went below the screen the drawer was opened over — nothing to return to.
    if (origin && depth < origin.depth) returnTo.current = null;
    if (open) setOpen(false);
  }, [pathname, depth, open, setOpen]);

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

  const dismissFromGesture = () => {
    returnTo.current = null;
    setOpen(false);
  };

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
          if (finished) runOnJS(dismissFromGesture)();
        });
        progress.value = withTiming(0, { duration: 160 });
      } else {
        tx.value = withTiming(0, { duration: 160 });
        progress.value = withTiming(1, { duration: 160 });
      }
    });

  const close = () => setOpen(false);
  // An explicit dismissal: the person is done with the drawer, so returning
  // from an earlier destination must not bring it back.
  const dismiss = () => {
    returnTo.current = null;
    close();
  };
  // Close first, navigate on the next frame: pushing while the panel is
  // still fully open ran the slide-out and the screen push in the same
  // frame, and on iOS the push animation could start with the drawer still
  // covering the incoming screen. The frame's delay lets the close begin,
  // so the new screen slides in from under a drawer that is already going.
  // Remember where we were, so Back from the destination reopens the drawer.
  const go = (path: string) => {
    returnTo.current = { path: pathname, depth: depthRef.current };
    close();
    requestAnimationFrame(() => router.push(path));
  };
  // Signing in leaves the app stack entirely and comes back through a
  // redirect, not a Back — never reopen the drawer for it.
  const goAuth = () => {
    dismiss();
    requestAnimationFrame(() => router.push("/(auth)/sign-in"));
  };
  // Tab destinations switch the tab in place rather than pushing a second
  // copy of the tabs group on top of the stack — there is no "back" to the
  // drawer from a tab, so nothing is remembered.
  const goTab = (path: string) => {
    dismiss();
    requestAnimationFrame(() => router.navigate(path));
  };
  // External pages (legal, help, socials) open over the app; the drawer
  // stays open underneath, so closing the browser returns straight to it.
  const openExternal = (url: string) => {
    void openExternalLink(url);
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
              top: insets.top + HEADER_HEIGHT,
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
          onPress={dismiss}
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
            style={{
              paddingTop: insets.top,
              paddingLeft: Math.max(insets.left, 4),
              paddingRight: Math.max(insets.right, 8),
            }}
            className="border-b border-border"
          >
            {/* Close on the left, Abonten mark on the right — mirrors the
                new main header (logo right). Same AbontenLogo size as the
                main header so the brand never jumps between the two. */}
            <View className="h-[54px] flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={dismiss}
                hitSlop={10}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="close" size={26} tone="foreground" />
              </Pressable>
              <AbontenLogo size={34} />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 32,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Abonten Weekly, for everyone it is switched on for (signed in or not). */}
            {weekly.enabled ? (
              <Row
                icon="sparkles-outline"
                label="Abonten Weekly"
                onPress={() => go("/(app)/weekly")}
              />
            ) : null}
            {content.spotlight ? (
              <Row
                icon="play-circle-outline"
                label="Spotlight"
                onPress={() => go("/(app)/spotlight")}
              />
            ) : null}
            {session ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    profile?.username
                      ? `View your profile, @${profile.username}`
                      : "Your account"
                  }
                  // The identity card is the person, so it opens their public
                  // profile (the same screen the Account tab's header card
                  // opens). The Account tab itself is one tab press away.
                  onPress={() =>
                    profile?.username
                      ? go(`/(app)/user/${profile.username}`)
                      : goTab("/(app)/account")
                  }
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
                {content.canPublish &&
                (content.spotlightPosting || content.storiesPosting) ? (
                  <Row
                    icon="videocam-outline"
                    label="Spotlight & Stories"
                    onPress={() => go("/(app)/spotlight/manage")}
                  />
                ) : null}

                <Label className="mb-1 mt-3">{t("account")}</Label>
                <Row
                  icon="receipt-outline"
                  label={t("myEvents")}
                  onPress={() => goTab("/(app)/tickets")}
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
                  onPress={() => goAuth()}
                />
                <Row
                  icon="person-add-outline"
                  label={t("signUp")}
                  onPress={() => goAuth()}
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
                  dismiss();
                  await unregisterPushToken();
                  await signOut();
                }}
              />
            ) : null}

            <Divider className="my-5" />

            <View className="gap-3">
              {LEGAL_LINK_ROWS.map(({ label, url }) => (
                <Pressable
                  key={label}
                  accessibilityRole="link"
                  onPress={() => openExternal(url)}
                  className="active:opacity-60"
                >
                  <AppText variant="muted">{label}</AppText>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="link"
                onPress={() => openExternal(HELP_URL)}
                className="active:opacity-60"
              >
                <AppText variant="muted">Help centre</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
                onPress={() => openSupportEmail()}
                className="active:opacity-60"
              >
                <AppText variant="muted">{SUPPORT_EMAIL}</AppText>
              </Pressable>
              <View className="mt-1 flex-row items-center gap-5">
                {SOCIAL_LINKS.map((link) => (
                  <Pressable
                    key={link.key}
                    accessibilityRole="link"
                    accessibilityLabel={`Abonten on ${link.label}`}
                    onPress={() => Linking.openURL(link.href).catch(() => {})}
                    className="active:opacity-60"
                  >
                    <Icon name={SOCIAL_ICON[link.key]} size={22} tone="muted" />
                  </Pressable>
                ))}
              </View>
              <AppText variant="meta" className="mt-1">
                © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}
              </AppText>
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
