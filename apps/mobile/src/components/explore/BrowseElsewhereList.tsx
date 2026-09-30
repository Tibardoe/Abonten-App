import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useMarket } from "@/features/markets/MarketProvider";
import type { BrowseSuggestions } from "@abonten/core/market/coverage";
import {
  BROWSE_ELSEWHERE_TITLE,
  browseReasonLabel,
  cityDistanceText,
} from "@abonten/core/market/coverageCopy";
import { AppText, Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// "Explore what's happening elsewhere": the launched cities offered from an
// area Abonten hasn't launched in, as the market's browse fallback picked
// them (@abonten/core/market/coverage `browseSuggestions`) — a short list
// to choose from, or one recommended city marked with why ("Nearest",
// "Most listings", "Suggested") so it never reads as the person's own city.
// A tap browses that city (a chosen area; "Use my current location" brings
// the phone back). Renders nothing when no launched city exists.

export function BrowseElsewhereList({
  browse,
  className,
}: {
  browse: BrowseSuggestions;
  className?: string;
}) {
  const { chooseArea } = useExploreLocation();
  const { context } = useMarket();
  const unit = context?.distanceUnit ?? "km";
  if (browse.cities.length === 0) return null;
  const reason = browseReasonLabel(browse.reason);

  return (
    <View className={`gap-1 ${className ?? ""}`}>
      <AppText variant="label">{BROWSE_ELSEWHERE_TITLE}</AppText>
      {browse.cities.map((city) => {
        const distance = cityDistanceText(city, unit);
        return (
          <Pressable
            key={city.region.id}
            accessibilityRole="button"
            accessibilityLabel={`Explore ${city.region.name}, ${distance}${reason ? `, ${reason}` : ""}`}
            onPress={() =>
              void chooseArea(
                city.region.lat,
                city.region.lng,
                city.region.name,
              )
            }
            className="min-h-[44px] flex-row items-center gap-2 active:opacity-60"
          >
            <Icon name="location-outline" size={18} tone="primary" />
            <AppText variant="bodyStrong" className="flex-1" numberOfLines={1}>
              {city.region.name}
            </AppText>
            {reason ? (
              <View className="rounded-full bg-primary/10 px-2 py-0.5">
                <AppText variant="caption" tone="brand">
                  {reason}
                </AppText>
              </View>
            ) : null}
            <AppText variant="meta">{distance}</AppText>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>
        );
      })}
    </View>
  );
}
