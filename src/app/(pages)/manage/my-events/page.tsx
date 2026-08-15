export const dynamic = "force-dynamic";

import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import CancelUserTicketBtn from "@/components/atoms/CancelUserTicketBtn";
import ViewTicketBtn from "@/components/atoms/ViewTicketBtn";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  let events = [];

  try {
    const response = await getUserAttendingEvents();

    if (response?.data) {
      events = response.data;
    }
  } catch (error) {
    console.error("Error fetching user attending events:", error);
  }

  return (
    <>
      <div className="space-y-5">
        <h1 className="md:text-2xl font-bold">My Tickets</h1>

        {events.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border"
              >
                <div className="relative h-48 w-full">
                  <Image
                    src={buildCloudinaryUrl(
                      event.event.flyer_public_id,
                      event.event.flyer_version,
                      { width: 400, height: 192 },
                    )}
                    alt={event.event.title}
                    fill
                    className="object-cover rounded-t-2xl"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/events/${generateSlug(
                        event.event.address.full_address,
                      )}/event/${event.event.slug}`}
                      className="text-xl font-semibold mb-2"
                    >
                      {event.event.title}
                    </Link>

                    <p className="text-sm text-muted-foreground mb-2 font-bold">
                      Ticket Type:{" "}
                      <span className="font-mono text-foreground">
                        {event.ticket_type.type}
                      </span>
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">
                    Ticket Code:{" "}
                    <span className="font-mono text-foreground">
                      {event.ticket_code}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Status:{" "}
                    {event.status === "active" ? (
                      <span className="font-semibold text-green-600">
                        {event.status}
                      </span>
                    ) : (
                      <span className="font-semibold text-red-600">
                        {event.status}
                      </span>
                    )}
                  </p>

                  <div className="flex justify-between gap-2">
                    <ViewTicketBtn event={event} />

                    <CancelUserTicketBtn
                      ticketId={event.id}
                      transactionId={event.transaction_id}
                      userId={event.user_id}
                      eventId={event.event.id}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">
            No event ticket purchased!
          </p>
        )}
      </div>
    </>
  );
}
