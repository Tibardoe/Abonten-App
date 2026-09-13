import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyProgram, useWeeklyTeaser } from "@/features/weekly/useWeekly";
import { hapticLight } from "@/lib/haptics";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { formatWeekRange } from "@abonten/core/weekly/week";
import { AppText, Icon, PressableScale } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { View } from "react-native";

// The "Abonten Weekly" card at the top of Explore. Shown only when the
// programme and its teaser are on for this person and this week's edition is
// out for the explored area; otherwise it takes no space at all.
export function WeeklyTeaserCard() {
  const router = useRouter();
  const { location } = useExploreLocation();
  const { program } = useWeeklyProgram();
  const teaser = useWeeklyTeaser(
    location ? { lat: location.lat, lng: location.lng } : null,
    program.teaser && !!location,
  ).data;

  if (!program.teaser || !teaser) return null;

  const open = () => {
    hapticLight();
    router.push(`/(app)/weekly/${teaser.scopeSlug}/${teaser.weekStart}`);
  };

  return (
    <PressableScale
      onPress={open}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${WEEKLY_PRODUCT_NAME}: ${teaser.title}. ${teaser.itemCount} picks. Open`}
      className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <View className="flex-1 gap-0.5">
        <AppText variant="overline" tone="brand" numberOfLines={1}>
          ✨ {WEEKLY_PRODUCT_NAME} ·{" "}
          {teaser.isFallbackScope ? "Ghana" : teaser.scopeName}
        </AppText>
        <AppText variant="cardTitle" numberOfLines={1}>
          {teaser.title}
        </AppText>
        <AppText variant="meta" numberOfLines={2}>
          {teaser.subtitle ?? WEEKLY_TAGLINE}{" "}
          {formatWeekRange(teaser.weekStart)}.
        </AppText>
      </View>
      <View
        className="flex-row"
        importantForAccessibility="no-hide-descendants"
      >
        {teaser.images.slice(0, 2).map((img, i) => (
          <View
            key={img.publicId}
            className="h-12 w-12 overflow-hidden rounded-lg border-2 border-card bg-muted"
            style={{ marginLeft: i === 0 ? 0 : -12 }}
          >
            <Image
              source={{
                uri: buildCloudinaryUrl(
                  img.publicId,
                  img.version ?? undefined,
                  {
                    width: 56,
                    height: 56,
                  },
                ),
              }}
              style={{ width: 48, height: 48 }}
              contentFit="cover"
            />
          </View>
        ))}
      </View>
      <Icon name="chevron-forward" size={18} tone="muted" />
    </PressableScale>
  );
}
