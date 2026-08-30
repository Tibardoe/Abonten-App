"use client";

import { cancelPlaceBooking } from "@/actions/cancelPlaceBooking";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import type { PaginatedResult } from "@/types/pagination";
import type {
  BookingStatus,
  CustomerPlaceBooking,
} from "@/types/placeBookingType";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-warning/10 text-warning",
  accepted: "bg-primary/10 text-primary",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function UserBookingsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<CustomerPlaceBooking>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<CustomerPlaceBooking>>;
  emptyState: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    try {
      const result = await cancelPlaceBooking(bookingId);
      if (result.status === 200) {
        toast.success(result.message ?? "Booking request cancelled.");
        queryClient.invalidateQueries({ queryKey });
      } else {
        toast.error(
          result.message ?? "We couldn't cancel that booking request.",
        );
      }
    } finally {
      setCancellingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <>
      <InfiniteList<CustomerPlaceBooking>
        queryKey={queryKey}
        initialPage={initialPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
        listClassName="flex flex-col gap-3"
        renderItem={(booking) => {
          const { date, time } = formatSingleDateTime(booking.requested_time);
          const canCancel =
            booking.status === "pending" || booking.status === "accepted";

          return (
            <li
              key={booking.id}
              className="border border-border rounded-lg p-4 space-y-2 bg-card text-card-foreground"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/places/${booking.place?.slug ?? ""}`}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {booking.place?.name ?? "Place"}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {date} at {time}
                  </p>
                  {booking.party_size != null && (
                    <p className="text-sm text-muted-foreground">
                      Party size: {booking.party_size}
                    </p>
                  )}
                </div>

                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[booking.status]}`}
                >
                  {booking.status}
                </span>
              </div>

              {canCancel && (
                <button
                  type="button"
                  disabled={cancellingId === booking.id}
                  onClick={() => setConfirmingId(booking.id)}
                  className="text-sm text-destructive hover:underline"
                >
                  Cancel booking
                </button>
              )}

              {confirmingId === booking.id && (
                <ConfirmDeleteModal
                  title="Cancel this booking request?"
                  message={`Cancel your booking request for ${
                    booking.place?.name ?? "this place"
                  }?`}
                  confirmLabel="Cancel Request"
                  cancelLabel="Keep Request"
                  isLoading={cancellingId === booking.id}
                  onConfirm={() => handleCancel(booking.id)}
                  onCancel={() => setConfirmingId(null)}
                />
              )}
            </li>
          );
        }}
      />
    </>
  );
}
