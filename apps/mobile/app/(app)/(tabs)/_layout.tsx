import {
  GlassTabBar,
  TAB_BLUR_TARGETS,
  TabBarOverlapContext,
  TabBlurTarget,
  type TabBlurTargets,
  tabBarOverlapFor,
} from "@/components/app/GlassTabBar";
import {
  AccountTabIcon,
  HomeTabIcon,
  MessagesTabIcon,
  SearchTabIcon,
  SpotlightTabIcon,
} from "@/components/app/TabBarIcons";
import { useContentProgram } from "@/features/content/useContentProgram";
import { useInboxRealtime } from "@/features/messaging/useInboxRealtime";
import { useUnreadMessageCount } from "@/features/messaging/useUnreadMessageCount";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Tabs } from "expo-router";
import { useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The bottom tabs — Home · Search · Spotlight · Messages · Account.
// Spotlight took the middle slot from Tickets (now a pushed screen reached
// from Account, the menu and payment success). The Spotlight tab follows
// the content programme: while Spotlight is off for this person it is
// hidden rather than shown as a dead end, and the bar has four tabs. The nav header is hidden here: every
// tab screen draws its own <AppHeader> (branded variant) so the primary
// screens read the same as the pushed secondary screens.
//
// Wallets moved off the bottom bar into Account › Wallets when Messages took
// its slot — the wallet screen itself is unchanged, only its route location
// (now /(app)/wallet, a pushed screen).
//
// The bar itself is GlassTabBar: a floating capsule (Liquid Glass on iOS 26)
// that the screens scroll behind — each tab screen keeps its last rows
// clear with useTabBarOverlap().
export default function TabsLayout() {
  const c = useThemeColors();
  const t = useTranslations("navigation");
  const { data: unread = 0 } = useUnreadMessageCount();
  const { program } = useContentProgram();
  const insets = useSafeAreaInsets();
  const blurTargets = useRef<TabBlurTargets>(new Map()).current;

  return (
    <TabBarOverlapContext.Provider value={tabBarOverlapFor(insets.bottom)}>
      <Tabs
        tabBar={(props) => (
          <GlassTabBar
            {...props}
            darkRoutes={["spotlight"]}
            blurTargets={blurTargets}
          />
        )}
        // Android blurs the screen behind the bar only through a target view
        // around it. Spotlight is left out: its video feed ends above the
        // bar, which sits over plain black there.
        screenLayout={
          TAB_BLUR_TARGETS
            ? ({ children, route }) =>
                route.name === "spotlight" ? (
                  children
                ) : (
                  <TabBlurTarget targets={blurTargets} routeKey={route.key}>
                    {children}
                  </TabBlurTarget>
                )
            : undefined
        }
        screenOptions={{
          headerShown: false,
          // Subtle content shift on tab change — fast, interruptible, and the
          // OS reduce-motion setting disables it automatically.
          animation: "shift",
          // The scene behind each tab's screen. Without it the tab-switch
          // shift reveals the container's default (white) between scenes.
          sceneStyle: { backgroundColor: c.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("explore"),
            tabBarLabel: t("home"),
            tabBarIcon: HomeTabIcon,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: t("search"),
            tabBarIcon: SearchTabIcon,
          }}
        />
        <Tabs.Screen
          name="spotlight"
          options={{
            title: t("spotlight"),
            href: program.spotlight ? undefined : null,
            // Full-bleed video: the scene is black and the bar turns dark
            // with it (GlassTabBar's darkRoutes).
            sceneStyle: { backgroundColor: "#000" },
            tabBarIcon: SpotlightTabIcon,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: t("messages"),
            tabBarBadge: unread > 0 ? unread : undefined,
            tabBarIcon: MessagesTabIcon,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: t("account"),
            tabBarIcon: AccountTabIcon,
          }}
        />
      </Tabs>
    </TabBarOverlapContext.Provider>
  );
}
