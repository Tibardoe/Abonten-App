import {
  type BrowsingArea,
  UNNAMED_AREA_LABEL,
  UNNAMED_CHOICE_LABEL,
  useExploreLocation,
} from "@/features/discovery/ExploreLocationProvider";
import { useMarket } from "@/features/markets/MarketProvider";
import { type AreaCoverage, areaCoverage } from "@abonten/core/market/coverage";
import { useMemo } from "react";

// Whether Abonten has launched where the app is browsing. The rule is
// @abonten/core/market/coverage (the same one the website and the server
// apply); its inputs are the open markets and the market the app already
// resolved for this area, both from the persisted market context, so the
// answer is there offline and on a cold start.
//
// `coverage` is null until the market context has arrived: the card stays
// hidden rather than guessing.

export type AreaCoverageView = {
  coverage: AreaCoverage | null;
  /** "Kumasi" / "Ho" — what to call the area in sentences; null = "here". */
  areaName: string | null;
};

/** A browsing area's town name for sentences, or null when it has none. */
export function areaDisplayName(area: BrowsingArea | null): string | null {
  if (!area || area.isFallback) return null;
  if (area.label === UNNAMED_AREA_LABEL || area.label === UNNAMED_CHOICE_LABEL)
    return null;
  // "Osu, Accra, Ghana" → "Osu".
  return area.label.split(",")[0]?.trim() || null;
}

export function useAreaCoverage(): AreaCoverageView {
  const { area } = useExploreLocation();
  const { ready, markets, context } = useMarket();
  const marketCountry = context?.marketCountry ?? null;
  const lat = area?.lat;
  const lng = area?.lng;

  return useMemo(() => {
    if (!ready || lat == null || lng == null)
      return { coverage: null, areaName: null };
    const coverage = areaCoverage({
      markets,
      marketCountry,
      point: { lat, lng },
    });
    return {
      coverage,
      areaName:
        coverage.kind === "not_launched"
          ? (coverage.region?.name ?? areaDisplayName(area))
          : null,
    };
  }, [ready, markets, marketCountry, lat, lng, area]);
}
