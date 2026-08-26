"use client";

import { respondToPlaceBooking } from "@/actions/respondToPlaceBooking";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import type { PaginatedResult } from "@/types/pagination";
import type {
  BookingStatus,
  OwnerPlaceBooking,
} from "@/types/placeBookingType";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type StatusFilter = BookingStatus | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-warning/10 text-warning",
  accepted: "bg-primary/10 text-primary",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

type ManagePlaceBookingsSectionProps = {
  placeId: string;
  initialPage: PaginatedResult<OwnerPlaceBooking>;
  fetchPage: (
    status: BookingStatus | undefined,
    cursor: string | null,
  ) => Promise<PaginatedResult<OwnerPlaceBooking>>;
};

/**
 * Owner's booking-requests list for the "Bookings" management tab.
 * Reservation REQUEST only, per the confirmed milestone scope -- Accept is
 * a direct action (like Respond on a review, see
 * ManagePlaceReviewsSection.tsx), while Decline goes through
 * ConfirmDeleteModal since it's a negative, somewhat final action for the
 * customer, per the milestone spec. `initialPage` (fetched server-side for
 * the default "pending" filter, the most actionable view) is only handed to
 * InfiniteList when that's still the active filter -- switching filters
 * fetches fresh via `fetchPage`, same as any other filtered query.
 */
export default function ManagePlaceBookingsSection({
  placeId,
  initialPage,
  fetchPage,
}: ManagePlaceBookingsSectionProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const queryKey = ["manage-place-bookings", placeId, statusFilter];

  const respond = async (bookingId: string, decision: "accept" | "decline") => {
    setRespondingId(bookingId);
    try {
      const result = await respondToPlaceBooking({ bookingId, decision });
      if (result.status === 200) {
        toast.success(result.message ?? "Booking request updated.");
        queryClient.invalidateQueries({ queryKey });
      } else {
        toast.error(
          result.message ?? "We couldn't update that booking request.",
        );
      }
    } finally {
      setRespondingId(null);
      setDecliningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStatusFilter(filter.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs md:text-sm border transition-colors ${
              statusFilter === filter.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <InfiniteList<OwnerPlaceBooking>
        queryKey={queryKey}
        initialPage={statusFilter === "pending" ? initialPage : null}
        fetchPage={(cursor) =>
          fetchPage(statusFilter === "all" ? undefined : statusFilter, cursor)
        }
        listClassName="flex flex-col gap-4"
        emptyState={
          <p className="text-muted-foreground text-sm py-4">
            No {statusFilter === "all" ? "" : `${statusFilter} `}bookings.
          </p>
        }
        renderItem={(booking) => {
          const { date, time } = formatSingleDateTime(booking.requested_time);

          return (
            <li
              key={booking.id}
              className="border border-border rounded-lg p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-card-foreground">
                    {booking.user_info?.username ?? "A customer"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {date} at {time}
                  </p>
                  {booking.place_service?.name && (
                    <p className="text-sm text-muted-foreground">
                      Service: {booking.place_service.name}
                    </p>
                  )}
                  {booking.party_size != null && (
                    <p className="text-sm text-muted-foreground">
                      Party size: {booking.party_size}
                    </p>
                  )}
                  {booking.note && (
                    <p className="text-sm text-foreground mt-1">
                      &ldquo;{booking.note}&rdquo;
                    </p>
                  )}
                </div>

                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[booking.status]}`}
                >
                  {booking.status}
                </span>
              </div>

              {booking.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={respondingId === booking.id}
                    onClick={() => respond(booking.id, "accept")}
                    className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {respondingId === booking.id ? "Accepting..." : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={respondingId === booking.id}
                    onClick={() => setDecliningId(booking.id)}
                    className="border border-border px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              )}

              {decliningId === booking.id && (
                <ConfirmDeleteModal
                  title="Decline this booking request?"
                  message={`Decline this booking request from ${
                    booking.user_info?.username ?? "this customer"
                  }?`}
                  confirmLabel="Decline Request"
                  cancelLabel="Keep Request"
                  isLoading={respondingId === booking.id}
                  onConfirm={() => respond(booking.id, "decline")}
                  onCancel={() => setDecliningId(null)}
                />
              )}
            </li>
          );
        }}
      />
    </div>
  );
}
