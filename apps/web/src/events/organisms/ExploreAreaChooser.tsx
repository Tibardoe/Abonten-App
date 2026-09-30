import getMarketContext from "@/actions/getMarketContext";
import LandingLocationSearch from "@/landingPage/organisms/LandingLocationSearch";
import { regionLaunchStatus } from "@abonten/core/market/coverage";
import Link from "next/link";

// /explore (and /events) with no area yet: instead of an empty page saying
// "choose a location", offer the three ways in — a city of the visitor's
// market (with its coordinates, so no lookup is needed), a search, or the
// visitor's own position when they ask for it. Launched cities come first;
// a city that's coming soon says so (its page explains and offers the
// waiting list).
export default async function ExploreAreaChooser() {
  const { markets, context } = await getMarketContext();
  const market =
    markets.find((m) => m.countryCode === context.marketCountry) ??
    markets[0] ??
    null;
  const cities = (market?.regions ?? [])
    .filter((region) => region.kind === "city")
    .sort(
      (a, b) =>
        Number(regionLaunchStatus(a) === "coming_soon") -
          Number(regionLaunchStatus(b) === "coming_soon") ||
        a.position - b.position,
    )
    .slice(0, 8);

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-2 py-10 text-center md:py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-balance md:text-4xl">
          Where do you want to go out?
        </h1>
        <p className="text-muted-foreground text-pretty">
          Pick a city, search for an area, or use where you are now.
        </p>
      </div>

      <LandingLocationSearch onDark={false} />

      {market && cities.length > 0 ? (
        <div className="w-full">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Cities in {market.name}
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {cities.map((city) => (
              <li key={city.id}>
                <Link
                  href={`/explore/${city.slug}?lat=${city.lat}&lng=${city.lng}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:border-primary hover:bg-accent"
                >
                  {city.name}
                  {regionLaunchStatus(city) === "coming_soon" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
