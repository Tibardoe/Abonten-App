import {
  type BrowsingArea,
  type DevicePermission,
  UNNAMED_AREA_LABEL,
} from "@/features/discovery/ExploreLocationProvider";
import {
  type AreaStatus,
  areaStatus,
} from "@abonten/core/location/browsingArea";
import type { IoniconName } from "@abonten/ui-native";

// The words for how the browsing area relates to the phone — one place, so
// the location switcher, the location sheet and the Places screen never
// describe the same state differently. Never the internal names
// ("following", "chosen"): the person is told what they would say
// themselves — it's near me, I picked it, my location is off.

export type AreaPresentation = {
  status: AreaStatus;
  /** The small line above the area name: "Near you", "Browsing", … */
  eyebrow: string;
  icon: IoniconName;
  /** A sentence for the location sheet. */
  sentence: string;
};

/**
 * "in Kumasi" / "near you" — for sentences like "No events …". A following
 * area whose town could not be named is "near you", never "in Your location".
 */
export function whereText(area: BrowsingArea | null): string {
  if (!area) return "here";
  if (area.mode === "following" && area.label === UNNAMED_AREA_LABEL)
    return "near you";
  return `in ${area.label}`;
}

export function describeArea(
  area: BrowsingArea | null,
  permission: DevicePermission,
): AreaPresentation {
  const status = areaStatus(area, permission);
  const label = area?.label ?? "Accra";
  switch (status) {
    case "near_you":
      return {
        status,
        eyebrow: "Near you",
        icon: "navigate",
        sentence: "Following your location — showing what's around you.",
      };
    case "chosen":
      return {
        status,
        eyebrow: "Browsing",
        icon: "location",
        sentence: `You chose ${label}. It stays put wherever you go, until you change it.`,
      };
    case "location_off":
      return {
        status,
        eyebrow: "Location off",
        icon: "location-outline",
        sentence: area?.isFallback
          ? `Showing ${label} for now. Turn on location to see what's near you, or choose an area.`
          : `Showing ${
              area?.label === UNNAMED_AREA_LABEL
                ? "where you last were"
                : `${label}, where you last were`
            }. Turn on location to keep following you.`,
      };
    case "locating":
      return {
        status,
        eyebrow: "Finding you…",
        icon: "locate-outline",
        sentence: `Showing ${label} until your location comes through.`,
      };
  }
}
