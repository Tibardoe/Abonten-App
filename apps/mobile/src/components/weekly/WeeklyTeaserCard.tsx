import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyProgram, useWeeklyTeaser } from "@/features/weekly/useWeekly";
import { hapticLight } from "@/lib/haptics";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyBannerSlide } from "@abonten/types/weeklyType";
import { AppText, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { WeeklyBanner } from "./WeeklyBanner";
import { WeeklyChip, weeklyListingPath } from "./weeklyBannerParts";

// The "Abonten Weekly" banner at the top of Explore: this week's listings
// rotate behind the edition's title, the banner opens the edition and the
// caption opens the listing on show. Shown only when the programme and its
// teaser are on for this person and this week's edition is out for the
// explored area; otherwise it takes no space at all.
export function WeeklyTeaserCard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { location } = useExploreLocation();
  const { program } = useWeeklyProgram();
  const teaser = useWeeklyTeaser(
    location ? { lat: location.lat, lng: location.lng } : null,
    program.teaser && !!location,
  ).data;

  if (!program.teaser || !teaser) return null;

  const area = teaser.isFallbackScope ? "Ghana" : teaser.scopeName;
  const week = formatWeekRange(teaser.weekStart);
  const picks = `${teaser.itemCount} ${teaser.itemCount === 1 ? "pick" : "picks"}`;
  const height = Math.round(Math.min(Math.max(width * 1.02, 380), 480));

  const open = () => {
    hapticLight();
    router.push(`/(app)/weekly/${teaser.scopeSlug}/${teaser.weekStart}`);
  };
  const openSlide = (slide: WeeklyBannerSlide) => {
    hapticLight();
    router.push(weeklyListingPath(slide));
  };

  return (
    <View className="mt-3">
      <WeeklyBanner
        slides={teaser.slides ?? []}
        height={height}
        onPress={open}
        onSlidePress={openSlide}
        accessibilityLabel={`Open ${WEEKLY_PRODUCT_NAME} for ${area}: ${teaser.title}, ${week}, ${picks}`}
        eyebrow={
          <>
            <WeeklyChip strong>
              ✨ {WEEKLY_PRODUCT_NAME} · {area}
            </WeeklyChip>
            {teaser.isFallbackScope ? (
              <WeeklyChip>Ghana-wide picks</WeeklyChip>
            ) : null}
          </>
        }
      >
        <AppText
          className="text-[12px] font-medium"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          {week} • {picks}
        </AppText>
        <AppText
          className="mt-1.5 text-[30px] font-extrabold leading-[33px] text-white"
          numberOfLines={2}
        >
          {teaser.title}
        </AppText>
        <AppText
          className="mt-2 text-[14px] leading-[20px]"
          style={{ color: "rgba(255,255,255,0.85)" }}
          numberOfLines={2}
        >
          {teaser.subtitle ?? WEEKLY_TAGLINE}
        </AppText>
        <View className="mt-4 flex-row">
          <View className="flex-row items-center gap-2.5 rounded-full bg-white py-1.5 pl-4 pr-1.5">
            <AppText className="text-[14px] font-semibold text-slate-950">
              {"See this week's picks"}
            </AppText>
            <View className="h-7 w-7 items-center justify-center rounded-full bg-slate-950">
              <Icon name="arrow-forward" size={15} color="#fff" />
            </View>
          </View>
        </View>
      </WeeklyBanner>
    </View>
  );
}
