export const dynamic = "force-dynamic";

import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import TicketsList from "./TicketsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const noActiveTicketsState = (
  <p className="text-center text-muted-foreground">
    No event ticket purchased!
  </p>
);

const noCancelledTicketsState = (
  <p className="text-center text-muted-foreground text-sm">
    No cancelled tickets.
  </p>
);

export default async function page() {
  const [activeFirstPage, cancelledFirstPage] = await Promise.all([
    getUserAttendingEvents({ status: "active" }),
    getUserAttendingEvents({ status: "cancelled" }),
  ]);

  async function fetchActivePage(cursor: string | null) {
    "use server";
    return getUserAttendingEvents({ status: "active", cursor });
  }

  async function fetchCancelledPage(cursor: string | null) {
    "use server";
    return getUserAttendingEvents({ status: "cancelled", cursor });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <h1 className="md:text-2xl font-bold">Active Tickets</h1>

        <TicketsList
          queryKey={["attending-events", "active"]}
          initialPage={activeFirstPage}
          fetchPage={fetchActivePage}
          emptyState={noActiveTicketsState}
        />
      </div>

      <details className="space-y-5">
        <summary className="md:text-xl font-bold cursor-pointer text-muted-foreground">
          Cancelled
        </summary>

        <div className="mt-5">
          <TicketsList
            queryKey={["attending-events", "cancelled"]}
            initialPage={cancelledFirstPage}
            fetchPage={fetchCancelledPage}
            emptyState={noCancelledTicketsState}
          />
        </div>
      </details>
    </div>
  );
}
