import { useSession } from "@/auth/SessionProvider";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import {
  rememberJoinAfterSignIn,
  useAreaWaitlist,
} from "@/features/markets/useAreaWaitlist";
import { setPendingRedirect } from "@/lib/authRedirect";
import {
  type AreaCoverage,
  waitlistAreaKey,
} from "@abonten/core/market/coverage";
import {
  JOIN_WAITLIST_LABEL_KEY,
  LEAVE_WAITLIST_LABEL_KEY,
  NOT_LAUNCHED_BODY_KEY,
  notLaunchedTitle,
  supplyPrompt,
  waitingText,
} from "@abonten/core/market/coverageCopy";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { usePathname, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { BrowseElsewhereList } from "./BrowseElsewhereList";

// "Abonten isn't in Kumasi yet" — shown under the location switcher when the
// browsing area is a city that's coming soon, or (in a market set to
// launched areas only) somewhere outside every launched city. It never
// hides anything: whatever is listed nearby still shows below it. It offers
// what the person can do now — get a notice when the city launches, explore
// a launched city (BrowseElsewhereList, per the market's browse fallback),
// or list their own events and places there — and says nothing about when.
// While Explore's list is empty the cities move down into its empty state
// (`showBrowse` false), so they appear once, where the person is looking.
//
// The cross folds it to one line for as long as the app is open; after
// joining the list it is folded to "We'll tell you…" on its own.

type NotLaunched = Extract<AreaCoverage, { kind: "not_launched" }>;

// Folded cards, by area, for the life of the app.
const folded = new Set<string>();

export function AreaCoverageCard({
  coverage,
  areaName,
  showBrowse = true,
}: {
  coverage: NotLaunched;
  areaName: string | null;
  showBrowse?: boolean;
}) {
  const t = useTranslations("explore");
  const tc = useTranslations("core");

  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const { area } = useExploreLocation();
  const lat = area?.lat;
  const lng = area?.lng;
  const point = useMemo(
    () => (lat != null && lng != null ? { lat, lng } : null),
    [lat, lng],
  );
  const waitlist = useAreaWaitlist(point, areaName, true);
  const areaKey = point ? waitlistAreaKey(coverage.region, point) : "";
  // null until the person folds or opens it: folded when they folded it
  // earlier in this run of the app, or once they are on the list.
  const [choice, setChoice] = useState<boolean | null>(null);
  const compact = choice ?? (folded.has(areaKey) || waitlist.waiting);

  const title = notLaunchedTitle(tc, areaName);

  function fold(next: boolean) {
    if (next) folded.add(areaKey);
    else folded.delete(areaKey);
    setChoice(next);
  }

  function onJoin() {
    if (!point) return;
    if (!session) {
      rememberJoinAfterSignIn(point, areaName);
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    // Fold on its own once the server confirms.
    setChoice(null);
    waitlist.join(areaName);
  }

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("showMore", {
          value: waitlist.waiting ? waitingText(tc, areaName) : title,
        })}
        onPress={() => fold(false)}
        className="mx-4 mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 active:opacity-70"
      >
        <Icon
          name={waitlist.waiting ? "notifications" : "time-outline"}
          size={18}
          tone="primary"
        />
        <AppText variant="small" className="flex-1" numberOfLines={1}>
          {waitlist.waiting ? waitingText(tc, areaName) : title}
        </AppText>
        <Icon name="chevron-down" size={16} tone="muted" />
      </Pressable>
    );
  }

  return (
    <View className="mx-4 mb-2 gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-row items-start gap-3">
        <Icon name="time-outline" size={24} tone="primary" />
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="meta">
            {waitlist.waiting
              ? waitingText(tc, areaName)
              : tc(NOT_LAUNCHED_BODY_KEY)}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("foldThisMessage")}
          hitSlop={10}
          onPress={() => fold(true)}
          className="active:opacity-60"
        >
          <Icon name="close" size={20} tone="muted" />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {waitlist.waiting ? (
          <Button
            title={tc(LEAVE_WAITLIST_LABEL_KEY)}
            size="sm"
            variant="outline"
            onPress={waitlist.leave}
            loading={waitlist.leaving}
            loadingTitle={t("removingYou")}
          />
        ) : (
          <Button
            title={tc(JOIN_WAITLIST_LABEL_KEY)}
            size="sm"
            leftIcon="notifications-outline"
            onPress={onJoin}
            loading={waitlist.joining}
            loadingTitle={t("addingYou")}
          />
        )}
      </View>

      {showBrowse && coverage.browse.cities.length > 0 ? (
        <BrowseElsewhereList
          browse={coverage.browse}
          className="border-t border-border pt-2.5"
        />
      ) : null}

      <View className="gap-1 border-t border-border pt-2.5">
        <AppText variant="small">{supplyPrompt(tc, areaName)}</AppText>
        <View className="flex-row gap-4">
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push("/(app)/event/new")}
            className="active:opacity-60"
          >
            <AppText variant="label" tone="brand">
              {t("listAnEvent")}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push("/(app)/place/new")}
            className="active:opacity-60"
          >
            <AppText variant="label" tone="brand">
              {t("addAPlace")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
