"use client";

import cancelUserTicket from "@/actions/cancelUserTicket";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { invalidateTicketStatusQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Notification from "./Notification";

type CancelTicketProp = {
  ticketId: string;
  transactionId: string | null;
};

export default function CancelUserTicketBtn({
  ticketId,
  transactionId,
}: CancelTicketProp) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelUserTicket(ticketId, transactionId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowCancelConfirm(false);
        invalidateTicketStatusQueries(queryClient);
        showMessage(response.message);
      } else {
        setError(response.message);
      }
    },
    onError: () => {
      setError("Something went wrong. Please try again.");
    },
  });

  return (
    <>
      <button
        type="button"
        className="bg-none text-destructive border border-border text-sm px-4 py-2 rounded-lg"
        onClick={() => {
          setError(null);
          setShowCancelConfirm(true);
        }}
      >
        Cancel Ticket
      </button>

      {showCancelConfirm && (
        <ConfirmDeleteModal
          message={error ?? "Are you sure you want to cancel this ticket?"}
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
