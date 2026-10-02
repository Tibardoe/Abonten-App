"use client";

import { cancelPlaceBooking } from "@/actions/cancelPlaceBooking";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { resolveBookingState } from "@abonten/core/placeBooking";
import type { PaginatedResult } from "@abonten/types/pagination";
import type {
  BookingStatus,
  CustomerPlaceBooking,
} from "@abonten/types/placeBookingType";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

// "expired" is derived, not stored: the owner never answered before the
// date arrived. It used to read "Pending" with a live Cancel button, so the
// customer could not tell whether to turn up.
type BookingState = BookingStatus | "lapsed";

const STATUS_STYLES: Record<BookingState, string> = {
  pending: "bg-warning/10 text-warning",
  accepted: "bg-primary/10 text-primary",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  lapsed: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<BookingState, string> = {
  pending: "pending",
  accepted: "accepted",
  declined: "declined",
  cancelled: "cancelled",
  lapsed: "expired",
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
  const locale = useLocale();

  const t = useTranslations("account");

  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    try {
      const result = await cancelPlaceBooking(bookingId);
      if (result.status === 200) {
        toast.success(result.message ?? t("bookingRequestCancelled"));
        queryClient.invalidateQueries({ queryKey });
      } else {
        toast.error(result.message ?? t("weCouldnTCancelThatBooking"));
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
          const { date, time } = formatSingleDateTime(
            booking.requested_time,
            undefined,
            locale,
          );
          const state = resolveBookingState(
            booking.status,
            booking.requested_time,
          ) as BookingState;
          const canCancel = state === "pending" || state === "accepted";

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
                    {booking.place?.name ?? t("place")}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {t("at", { date: date, time: time })}
                  </p>
                  {booking.party_size != null && (
                    <p className="text-sm text-muted-foreground">
                      {t("partySize", { party_size: booking.party_size })}
                    </p>
                  )}
                </div>

                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[state]}`}
                >
                  {STATUS_LABELS[state]}
                </span>
              </div>

              {canCancel && (
                <button
                  type="button"
                  disabled={cancellingId === booking.id}
                  onClick={() => setConfirmingId(booking.id)}
                  className="text-sm text-destructive hover:underline"
                >
                  {t("cancelBooking")}
                </button>
              )}

              {confirmingId === booking.id && (
                <ConfirmDeleteModal
                  title={t("cancelThisBookingRequest")}
                  message={t("cancelYourBookingRequestFor", {
                    value: booking.place?.name ?? "this place",
                  })}
                  confirmLabel={t("cancelRequest")}
                  cancelLabel={t("keepRequest")}
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
