import {
  type BrowsingArea,
  type DevicePermission,
  UNNAMED_AREA_LABEL,
  displayAreaLabel,
} from "@/features/discovery/ExploreLocationProvider";
import {
  type AreaStatus,
  areaStatus,
} from "@abonten/core/location/browsingArea";
import type { IoniconName } from "@abonten/ui-native";
import { translatorFor } from "@abonten/ui-native/i18n";

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
  if (!area) return translatorFor("explore")("here");
  if (area.mode === "following" && area.label === UNNAMED_AREA_LABEL)
    return translatorFor("explore")("nearYou");
  return translatorFor("explore")("inArea", {
    area: displayAreaLabel(area.label, translatorFor("explore")),
  });
}

export function describeArea(
  area: BrowsingArea | null,
  permission: DevicePermission,
): AreaPresentation {
  const status = areaStatus(area, permission);
  // The stored label of an unnamed area is an English sentinel; the
  // sentences below show it in the reader's language.
  const label = area
    ? displayAreaLabel(area.label, translatorFor("explore"))
    : translatorFor("explore")("yourArea");
  switch (status) {
    case "near_you":
      return {
        status,
        eyebrow: translatorFor("explore")("nearYou2"),
        icon: "navigate",
        sentence: translatorFor("explore")("followingYourLocationShowingWhatS"),
      };
    case "chosen":
      return {
        status,
        eyebrow: translatorFor("explore")("browsing"),
        icon: "location",
        sentence: translatorFor("explore")("youChoseItStaysPutWherever", {
          label: label,
        }),
      };
    case "location_off":
      return {
        status,
        eyebrow: translatorFor("explore")("locationOff"),
        icon: "location-outline",
        sentence: area?.isFallback
          ? translatorFor("explore")("showingForNowTurnOnLocation", {
              label: label,
            })
          : area?.label === UNNAMED_AREA_LABEL
            ? translatorFor("explore")("showingWhereYouLastWere")
            : translatorFor("explore")("showingAreaWhereYouLastWere", {
                label,
              }),
      };
    case "locating":
      return {
        status,
        eyebrow: translatorFor("explore")("findingYou"),
        icon: "locate-outline",
        sentence: translatorFor("explore")(
          "showingUntilYourLocationComesThrough",
          { label: label },
        ),
      };
  }
}
