import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";

// Shown when a location slug in the URL cannot be turned into coordinates —
// an address Google does not recognise, or a geocoding lookup that timed
// out. The alternative is querying the discovery RPCs with null coordinates,
// which returns nothing and reads as "there is nothing here" rather than
// "we could not find that place". The location picker stays on screen so
// the visitor can choose somewhere else instead of hitting a dead end.
export default function LocationUnavailable({ place }: { place: string }) {
  return (
    <div>
      <LocationAndFilterSection />
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-semibold">
          We couldn&apos;t find {place || "that place"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Check the spelling, or pick a location above to see what&apos;s on
          nearby.
        </p>
      </div>
    </div>
  );
}
