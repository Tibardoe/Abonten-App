"use client";

import cancelUserTicket from "@/actions/cancelUserTicket";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { invalidateTicketStatusQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  // A ticket only has a transaction to refund if it was actually paid for
  // (free tickets never get a linked transaction — see generateTicket.ts) —
  // the menu label reflects that instead of always saying "refund".
  const menuLabel = transactionId ? "Request Refund" : "Cancel Ticket";

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
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Ticket options"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
            onClick={() => {
              setMenuOpen(false);
              setError(null);
              setShowCancelConfirm(true);
            }}
          >
            {menuLabel}
          </button>
        </PopoverContent>
      </Popover>

      {showCancelConfirm && (
        <ConfirmDeleteModal
          message={
            error ??
            (transactionId
              ? "Are you sure you want to cancel this ticket? A refund will be issued to your original payment method."
              : "Are you sure you want to cancel this ticket?")
          }
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
