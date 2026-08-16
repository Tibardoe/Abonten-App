export const dynamic = "force-dynamic";

import getOrganizerEvents from "@/actions/getOrganizerEvents";
import OrganizerEventsList from "./OrganizerEventsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = <p>None</p>;

export default async function page() {
  const firstPage = await getOrganizerEvents();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerEvents({ cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">List of Events Created</h1>

      <OrganizerEventsList
        queryKey={["organizer-events"]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
