"use client";

import cancelUserTicket from "@/actions/cancelUserTicket";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/useToast";
import { invalidateTicketStatusQueries } from "@/utils/mutationQueryInvalidation";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserTicketType } from "@abonten/types/ticketType";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { useState } from "react";

type CancelTicketProp = {
  ticketId: string;
  transactionId: string | null;
  // The InfiniteList cache entry (["attending-events", "active"]) this
  // ticket's card was rendered from — needed to optimistically pull the
  // card out of that exact list and, on failure, put it back.
  queryKey: unknown[];
};

type TicketsCache = InfiniteData<PaginatedResult<UserTicketType>>;

export default function CancelUserTicketBtn({
  ticketId,
  transactionId,
  queryKey,
}: CancelTicketProp) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const queryClient = useQueryClient();
  const toast = useToast();

  // A ticket only has a transaction to refund if it was actually paid for
  // (free tickets never get a linked transaction — see generateTicket.ts) —
  // the menu label reflects that instead of always saying "refund".
  const menuLabel = transactionId ? "Request Refund" : "Cancel Ticket";

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelUserTicket(ticketId, transactionId),

    // Cancellation is a simple, user-confirmed status flip (see
    // cancelUserTicket.ts) that's highly likely to succeed and trivial to
    // undo, so the card leaves the Active list the moment the user
    // confirms rather than waiting on the round trip.
    onMutate: async () => {
      setShowCancelConfirm(false);

      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<TicketsCache>(queryKey);

      queryClient.setQueryData<TicketsCache>(
        queryKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((ticket) => ticket.id !== ticketId),
            })),
          },
      );

      return { previousData };
    },

    onSuccess: (response, _vars, context) => {
      if (response.status === 200) {
        toast.success(response.message);
      } else {
        // Resolved but rejected server-side (e.g. 404/500) — this action
        // never throws, so onError never fires for this case; roll back
        // here instead.
        if (context?.previousData) {
          queryClient.setQueryData(queryKey, context.previousData);
        }
        toast.error(
          response.message ?? "Couldn't cancel this ticket. Please try again.",
        );
      }
    },

    onError: (_error, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error("Couldn't cancel this ticket. Please try again.");
    },

    onSettled: () => {
      invalidateTicketStatusQueries(queryClient);
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
              setShowCancelConfirm(true);
            }}
          >
            {menuLabel}
          </button>
        </PopoverContent>
      </Popover>

      {showCancelConfirm && (
        <ConfirmDeleteModal
          title="Cancel this ticket?"
          message={
            transactionId
              ? "Are you sure you want to cancel this ticket? A refund will be issued to your original payment method."
              : "Are you sure you want to cancel this ticket?"
          }
          confirmLabel="Cancel Ticket"
          cancelLabel="Keep Ticket"
          loadingLabel="Cancelling…"
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
