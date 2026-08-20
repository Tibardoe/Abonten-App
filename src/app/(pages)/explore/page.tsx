import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Only reached directly (typed URL, bookmark) — every nav link that already
// knows the user's location links straight to /explore/[location] instead.
// Mirrors src/app/(pages)/events/page.tsx exactly.
export default function page() {
  return (
    <div className="h-dvh">
      <LocationAndFilterSection />
      <div className="h-[50%] flex justify-center items-center">
        No address set
      </div>
    </div>
  );
}
