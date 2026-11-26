import { useShowcaseWall } from "@/features/showcase/useShowcase";
import { useAppActive } from "@/lib/useAppActive";
import { AppText, Icon, useReducedMotion } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { ShowcaseMarqueeRow } from "./ShowcaseMarqueeRow";

// "On Abonten" on the Explore tab: the hosts and places that are on
// Abonten, in two rows drifting slowly in opposite directions
// (docs/architecture/showcase.md). Staff pick who is on it; a row shows
// only when enough of them qualify, and the whole section hides when
// neither does, when it is off for this person, or while the read has
// failed (never "nobody is here").
//
// The rows stop under a finger, when Explore is not the screen in front and
// when the app is in the background; with reduced motion or a screen reader
// on they are plain sideways lists that never move by themselves.
//
// The wording is "On Abonten": never "partners" or "trusted by".

function useScreenReaderOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (live) setOn(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setOn,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function OnAbontenShowcase({
  location,
}: {
  location: { lat: number; lng: number } | null;
}) {
  const t = useTranslations("showcase");
  const router = useRouter();
  const { data: wall } = useShowcaseWall(location);
  const focused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReaderOn();
  // One clock for every tile, renewed with the data.
  const now = useMemo(() => (wall ? new Date() : new Date(0)), [wall]);

  if (!wall || (wall.hosts.length === 0 && wall.places.length === 0)) {
    return null;
  }

  const still = reduceMotion || screenReader;
  const moving = focused && appActive;
  const openDirectory = () =>
    router.push({
      pathname: "/(app)/on-abonten",
      params: location
        ? { lat: String(location.lat), lng: String(location.lng) }
        : {},
    });

  return (
    <View className="pt-6">
      <View className="flex-row items-end justify-between gap-3 px-4">
        <View className="flex-1 gap-0.5">
          <AppText variant="sectionTitle" accessibilityRole="header">
            {t("title")}
          </AppText>
          <AppText variant="meta" tone="muted">
            {t("subtitle")}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("seeAllLabel")}
          onPress={openDirectory}
          hitSlop={8}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <AppText variant="small" tone="brand" className="font-semibold">
            {t("seeAll")}
          </AppText>
          <Icon name="chevron-forward" size={16} tone="primary" />
        </Pressable>
      </View>
      <ShowcaseMarqueeRow
        title={t("hosts")}
        tiles={wall.hosts}
        moving={moving}
        still={still}
        now={now}
      />
      <ShowcaseMarqueeRow
        title={t("places")}
        tiles={wall.places}
        reverse
        moving={moving}
        still={still}
        now={now}
      />
    </View>
  );
}
