export const dynamic = "force-dynamic";

import getOrganizerEvents from "@/actions/getOrganizerEvents";
import { PageTitle } from "@/components/ui/typography";
import OrganizerManagedEventsList from "./OrganizerManagedEventsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components

const emptyState = (
  <p className="text-muted-foreground text-sm">
    You don't have any events yet.
  </p>
);

// "My Managed Events" -- the Events counterpart to manage/places/page.tsx.
// Reuses getOrganizerEvents.ts unchanged (already owner-scoped,
// cursor-paginated) -- this is the sole entry point into event management,
// per the Unified Event Management spec (Part 3/5).
export default async function page() {
  const firstPage = await getOrganizerEvents();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerEvents({ cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>Your Events</PageTitle>

      <OrganizerManagedEventsList
        queryKey={["organizer-events"]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
