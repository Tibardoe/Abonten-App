export const dynamic = "force-dynamic";

import getOrganizerPlaces from "@/actions/getOrganizerPlaces";
import OrganizerPlacesList from "./OrganizerPlacesList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
  <p className="text-muted-foreground text-sm">You don't own any places yet.</p>
);

// List of the signed-in user's owned places -- mirrors manage/events/page.tsx
// (getOrganizerPlaces is the Places counterpart to getOrganizerEvents, same
// InfiniteList shape).
export default async function page() {
  const firstPage = await getOrganizerPlaces();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerPlaces({ cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">Your Places</h1>

      <OrganizerPlacesList
        queryKey={["organizer-places"]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
