"use client";

import CancelUserTicketBtn from "@/components/atoms/CancelUserTicketBtn";
import ViewTicketBtn from "@/components/atoms/ViewTicketBtn";
import TicketCardSkeleton from "@/components/molecules/TicketCardSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { generateSlug } from "@/utils/geerateSlug";
import { getRefundStatusLabel } from "@/utils/refundStatus";
import Image from "next/image";
import Link from "next/link";

function TicketCard({
  event,
  showRefundInfo = false,
}: {
  event: UserTicketType;
  // Refund status/amount now only has one home: the Refunds tab. Cancelled
  // just shows "cancelled" — no duplicate refund badge — since the details
  // live in a dedicated section instead of being repeated on every card.
  showRefundInfo?: boolean;
}) {
  const refundBadge =
    showRefundInfo && event.status === "cancelled" && event.transaction
      ? getRefundStatusLabel(
          event.transaction.status,
          event.transaction.refund_requested_at,
        )
      : null;
  // Only set when this card came from the Refunds tab (TICKET_REFUND_SELECT)
  // — Active/Cancelled fetch a lighter transaction shape without it.
  const refundAmount = event.transaction?.amount;
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
        <p
          className={`text-sm text-muted-foreground ${refundBadge ? "mb-1" : "mb-4"}`}
        >
          Status:{" "}
          {event.status === "active" ? (
            <span className="font-semibold text-green-600">{event.status}</span>
          ) : (
            <span className="font-semibold text-red-600">{event.status}</span>
          )}
        </p>

        {refundBadge && (
          <div className="mb-4">
            {refundAmount !== undefined && (
              <p className="text-sm font-bold">
                Refund: {event.transaction?.currency} {refundAmount.toFixed(2)}
              </p>
            )}
            <p className={`text-sm font-semibold ${refundBadge.className}`}>
              {refundBadge.label}
            </p>
            {refundBadge.description && (
              <p className="text-xs text-muted-foreground">
                {refundBadge.description}
              </p>
            )}
          </div>
        )}

        {showRefundInfo &&
          event.status === "cancelled" &&
          !event.transaction && (
            <p className="text-sm mb-4 text-muted-foreground">
              No payment on this ticket — nothing to refund.
            </p>
          )}

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

function TicketsListSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {Array.from({ length: 6 }, (_, i) => (
        <TicketCardSkeleton key={i.toLocaleString()} />
      ))}
    </div>
  );
}

export default function TicketsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
  showRefundInfo = false,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserTicketType> | null;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<UserTicketType>>;
  emptyState: React.ReactNode;
  showRefundInfo?: boolean;
}) {
  return (
    <InfiniteList<UserTicketType>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      loadingSkeleton={<TicketsListSkeleton />}
      listElement="div"
      listClassName="grid md:grid-cols-3 gap-6"
      renderItem={(event) => (
        <TicketCard
          key={event.id}
          event={event}
          showRefundInfo={showRefundInfo}
        />
      )}
    />
  );
}
