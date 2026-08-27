"use client";

import cancelEvent from "@/actions/cancelEvent";
import getEventCancellationImpact from "@/actions/getEventCancellationImpact";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdOutlineCancel } from "react-icons/md";

type CancelProp = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
  /** Closes the parent dropdown once the confirm dialog is dismissed --
   * required when asMenuItem (see EventCardMenuBtn.tsx). */
  onRequestClose?: () => void;
};

function buildConfirmMessage(
  impact:
    | {
        paidTicketCount: number;
        freeTicketCount: number;
        attendeeCount: number;
      }
    | undefined,
  isLoadingImpact: boolean,
): string {
  if (isLoadingImpact || !impact) {
    return "Checking this event for attendees…";
  }

  if (impact.paidTicketCount > 0) {
    return `${impact.attendeeCount} attendee${impact.attendeeCount === 1 ? "" : "s"} who already purchased tickets will be refunded to the payment method used for their ticket. This action cannot be undone.`;
  }

  if (impact.freeTicketCount > 0) {
    return `${impact.attendeeCount} registered attendee${impact.attendeeCount === 1 ? "" : "s"} will be notified that the event has been cancelled. This action cannot be undone.`;
  }

  return "This event will no longer be available to attendees. This action cannot be undone.";
}

export default function CancelButton({
  eventId,
  asMenuItem,
  onRequestClose,
}: CancelProp) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: impactResponse, isLoading: isLoadingImpact } = useQuery({
    queryKey: ["event-cancellation-impact", eventId],
    queryFn: () => getEventCancellationImpact(eventId),
    enabled: showCancelConfirm,
  });

  const impact =
    impactResponse?.status === 200 ? impactResponse.data : undefined;

  const closeConfirm = () => {
    setShowCancelConfirm(false);
    onRequestClose?.();
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: (response) => {
      if (response.status === 200) {
        closeConfirm();
        invalidateEventListQueries(queryClient);
        toast.success(response.message);
      } else {
        setError(
          response.message ?? "Failed updating event status. Please try again.",
        );
      }
    },
    onError: () => {
      setError("Something went wrong. Please try again.");
    },
  });

  const openConfirm = () => {
    setError(null);
    setShowCancelConfirm(true);
  };

  return (
    <>
      {asMenuItem ? (
        <DropdownMenuItem
          onSelect={(event) => {
            // Keep the dropdown mounted -- otherwise Radix unmounts this
            // component (and the confirm-dialog state below) before the
            // dialog ever renders.
            event.preventDefault();
            openConfirm();
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <MdOutlineCancel className="text-xl" />
          Cancel Event
        </DropdownMenuItem>
      ) : (
        <button
          onClick={openConfirm}
          type="button"
          className="flex items-center gap-1 p-1 text-destructive"
        >
          <MdOutlineCancel className="text-xl " />
          Cancel Event
        </button>
      )}

      {showCancelConfirm && (
        <ConfirmDeleteModal
          title="Cancel this event?"
          message={error ?? buildConfirmMessage(impact, isLoadingImpact)}
          confirmLabel="Cancel Event"
          cancelLabel="Go Back"
          loadingLabel="Cancelling…"
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={closeConfirm}
        />
      )}
    </>
  );
}
