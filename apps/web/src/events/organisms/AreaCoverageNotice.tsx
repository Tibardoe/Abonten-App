import getAreaWaitlistStatus from "@/actions/getAreaWaitlistStatus";
import getMarketContext from "@/actions/getMarketContext";
import { locationLabelFromSlug } from "@/utils/locationLabel";
import { areaCoverage } from "@abonten/core/market/coverage";
import AreaCoveragePanel from "../molecules/AreaCoveragePanel";

// "Abonten isn't in Kumasi yet" at the top of Explore, for a city that's
// coming soon or (in a market that opens city by city) a place outside every
// launched city. The rule is @abonten/core/market/coverage — the same one
// the app and the server apply. Nothing below it is hidden: whatever is
// listed nearby still shows. Renders nothing where Abonten is open.
export default async function AreaCoverageNotice({
  lat,
  lng,
  location,
  autoJoin,
}: {
  lat: number | null;
  lng: number | null;
  location: string;
  /** Back from signing in to join the list: finish the join. */
  autoJoin: boolean;
}) {
  if (lat == null || lng == null) return null;
  const { markets, context } = await getMarketContext();
  const coverage = areaCoverage({
    markets,
    marketCountry: context.marketCountry,
    point: { lat, lng },
  });
  if (coverage.kind !== "not_launched") return null;

  const label = locationLabelFromSlug(location);
  const areaName =
    coverage.region?.name ?? (label === "your area" ? null : label);
  const status = await getAreaWaitlistStatus({ lat, lng });

  return (
    <AreaCoveragePanel
      nearest={coverage.nearest}
      areaName={areaName}
      point={{ lat, lng }}
      waiting={status.data?.waiting === true}
      distanceUnit={context.distanceUnit}
      autoJoin={autoJoin}
    />
  );
}
