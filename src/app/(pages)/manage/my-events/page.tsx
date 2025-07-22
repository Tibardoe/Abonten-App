import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import CancelUserTicketBtn from "@/components/atoms/CancelUserTicketBtn";
import ViewTicketBtn from "@/components/atoms/ViewTicketBtn";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";

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

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  return (
    <>
      <div className="space-y-5">
        <h1 className="md:text-2xl font-bold">My Tickets</h1>

        {events.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-200"
              >
                <div className="relative h-48 w-full">
                  <Image
                    src={`${cloudinaryBaseUrl}v${event.event.flyer_version}/${event.event.flyer_public_id}.jpg`}
                    alt={event.event.title}
                    layout="fill"
                    objectFit="cover"
                    className="rounded-t-2xl"
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

                    <p className="text-sm text-gray-600 mb-2 font-bold">
                      Ticket Type:{" "}
                      <span className="font-mono text-gray-800">
                        {event.ticket_type.type}
                      </span>
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">
                    Ticket Code:{" "}
                    <span className="font-mono text-gray-800">
                      {event.ticket_code}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
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
          <p className="text-center text-gray-500">
            No event ticket purchased!
          </p>
        )}
      </div>
    </>
  );
}
