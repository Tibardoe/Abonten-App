"use client";

import CancelUserTicketBtn from "@/components/atoms/CancelUserTicketBtn";
import ViewTicketBtn from "@/components/atoms/ViewTicketBtn";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";

function TicketCard({ event }: { event: UserTicketType }) {
  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border">
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
          <span className="font-mono text-foreground">{event.ticket_code}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Status:{" "}
          {event.status === "active" ? (
            <span className="font-semibold text-green-600">{event.status}</span>
          ) : (
            <span className="font-semibold text-red-600">{event.status}</span>
          )}
        </p>

        <div className="flex justify-between gap-2">
          <ViewTicketBtn event={event} />

          {event.status === "active" && (
            <CancelUserTicketBtn
              ticketId={event.id}
              transactionId={event.transaction_id}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function TicketsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserTicketType>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<UserTicketType>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<UserTicketType>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listElement="div"
      listClassName="grid md:grid-cols-3 gap-6"
      renderItem={(event) => <TicketCard key={event.id} event={event} />}
    />
  );
}
