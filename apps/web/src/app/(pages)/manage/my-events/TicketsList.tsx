"use client";

import CancelUserTicketBtn from "@/components/atoms/CancelUserTicketBtn";
import RefundStatusBadge from "@/components/atoms/RefundStatusBadge";
import RetryRefundBtn from "@/components/atoms/RetryRefundBtn";
import TicketStatusBadge from "@/components/atoms/TicketStatusBadge";
import ViewTicketBtn from "@/components/atoms/ViewTicketBtn";
import TicketCardSkeleton from "@/components/molecules/TicketCardSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getEventStatus } from "@/utils/eventStatus";
import { SHIMMER_BLUR_DATA_URL } from "@/utils/imagePlaceholder";
import { getRefundStatusLabel } from "@/utils/refundStatus";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserTicketType } from "@abonten/types/ticketType";
import Image from "next/image";
import Link from "next/link";

function TicketCard({
  event,
  showRefundInfo = false,
  queryKey,
}: {
  event: UserTicketType;
  // Refund status/amount now only has one home: the Refunds tab. Cancelled
  // just shows "cancelled" — no duplicate refund badge — since the details
  // live in a dedicated section instead of being repeated on every card.
  showRefundInfo?: boolean;
  // The InfiniteList cache entry this card was rendered from ("active" tab
  // only, in practice — see the status check below) — threaded through so
  // CancelUserTicketBtn can optimistically remove this exact card from this
  // exact list, and put it back if cancellation fails.
  queryKey: unknown[];
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
  // Distinguishes "the organizer cancelled the whole event" from "you
  // cancelled this ticket yourself" — both land on ticket.status='cancelled',
  // but event.status is already fetched on every card (TICKET_WITH_EVENT_SELECT/
  // TICKET_REFUND_SELECT both select event:event_id(*, ...)), so no extra
  // query is needed to tell them apart.
  const cancelledByOrganizer = event.event.status === "canceled";
  // Shared source of truth for the event's lifecycle -- an "active" ticket
  // for an event that has already ended (or been cancelled) must not keep
  // reading as "Active" in the list.
  const eventEnded =
    getEventStatus(
      event.event.starts_at,
      event.event.ends_at,
      event.event.occurrences,
    ) === "ended";
  const canRetryRefund =
    refundBadge?.label === "Refund failed" && event.transaction_id;
  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border">
      <div className="relative h-36 w-full">
        <Image
          src={buildCloudinaryUrl(
            event.event.flyer_public_id,
            event.event.flyer_version,
            { width: 400, height: 192 },
          )}
          alt={event.event.title}
          fill
          className="object-cover rounded-t-2xl"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          placeholder="blur"
          blurDataURL={SHIMMER_BLUR_DATA_URL}
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/events/${event.event.event_code.toLowerCase()}`}
            className="text-lg font-semibold line-clamp-2 hover:text-primary transition-colors"
          >
            {event.event.title}
          </Link>

          <TicketStatusBadge
            status={event.status}
            cancelledByOrganizer={cancelledByOrganizer}
            eventCancelled={cancelledByOrganizer}
            eventEnded={eventEnded}
          />
        </div>

        {/* Secondary details -- deliberately smaller/muted than the title
            and status above, per progressive-disclosure: the event and its
            status are what a user scans for first. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {event.ticket_type.type} ·{" "}
            <span className="font-mono">{event.ticket_code}</span>
          </span>
        </div>

        {refundBadge && (
          <div className="space-y-1 rounded-lg bg-muted/50 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RefundStatusBadge badge={refundBadge} />
              {refundAmount !== undefined && (
                <span className="text-sm font-semibold">
                  {event.transaction?.currency} {refundAmount.toFixed(2)}
                </span>
              )}
            </div>
            {refundBadge.description && (
              <p className="text-xs text-muted-foreground">
                {refundBadge.description}
              </p>
            )}
            {canRetryRefund && event.transaction_id && (
              <RetryRefundBtn
                transactionId={event.transaction_id}
                queryKey={queryKey}
              />
            )}
          </div>
        )}

        {showRefundInfo &&
          event.status === "cancelled" &&
          !event.transaction && (
            <p className="text-sm text-muted-foreground">
              No payment on this ticket — nothing to refund.
            </p>
          )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <ViewTicketBtn event={event} />

          {event.status === "active" &&
            !cancelledByOrganizer &&
            !eventEnded && (
              <CancelUserTicketBtn
                ticketId={event.id}
                transactionId={event.transaction_id}
                queryKey={queryKey}
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
          queryKey={queryKey}
        />
      )}
    />
  );
}
