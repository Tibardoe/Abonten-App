"use client";

import cancelEventTickets from "@/actions/cancelEventTickets";
import cancelUserTicket from "@/actions/cancelUserTicket";
import getEventCancelQuote from "@/actions/getEventCancelQuote";
import getTicketCancelQuote from "@/actions/getTicketCancelQuote";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/useToast";
import {
  invalidateOrganizerFinanceQueries,
  invalidateTicketStatusQueries,
} from "@/utils/mutationQueryInvalidation";
import {
  type EventCancelDialog,
  type TicketCancelDialog,
  eventCancelDialog,
  ticketCancelDialog,
} from "@abonten/core/ticketCancelQuote";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserTicketType } from "@abonten/types/ticketType";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type CancelTicketProp = {
  ticketId: string;
  transactionId: string | null;
  /** For "cancel all my tickets for this event". */
  eventId: string;
  // The InfiniteList cache entry (["attending-events", "active"]) this
  // ticket's card was rendered from — needed to optimistically pull the
  // card out of that exact list and, on failure, put it back.
  queryKey: unknown[];
};

type TicketsCache = InfiniteData<PaginatedResult<UserTicketType>>;

export default function CancelUserTicketBtn({
  ticketId,
  transactionId,
  eventId,
  queryKey,
}: CancelTicketProp) {
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const locale = useLocale();

  const [menuOpen, setMenuOpen] = useState(false);
  // What cancelling gives back, asked before the dialog opens: a ticket
  // paid for together with others is cancelled with them (their ids are
  // pulled from the list too).
  // "event": every ticket the caller holds for the event (offered when
  // there is more than this one).
  const [confirm, setConfirm] = useState<
    | { mode: "ticket"; dialog: TicketCancelDialog; ticketIds: string[] }
    | { mode: "event"; dialog: EventCancelDialog; ticketIds: string[] }
    | null
  >(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  // A ticket only has a transaction to refund if it was actually paid for
  // (free tickets never get a linked transaction — see generateTicket.ts) —
  // the menu label reflects that instead of always saying "refund".
  const menuLabel = transactionId ? t("requestRefund") : t("cancelTicket");

  const quote = useMutation({
    mutationFn: () => getTicketCancelQuote(ticketId),
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message ?? t("couldnTCancelThisTicketPlease"));
        return;
      }
      const dialog = ticketCancelDialog({ locale, t: tc }, response.data);
      if (!dialog.confirm) {
        toast.error(dialog.body);
        return;
      }
      setConfirm({
        mode: "ticket",
        dialog,
        ticketIds: [ticketId, ...response.data.otherTicketIds],
      });
    },
    onError: () => toast.error(t("couldnTCancelThisTicketPlease")),
  });

  const eventQuote = useMutation({
    mutationFn: () => getEventCancelQuote(eventId),
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message ?? t("couldnTCancelThisTicketPlease"));
        return;
      }
      const dialog = eventCancelDialog({ locale, t: tc }, response.data);
      if (!dialog.confirm) {
        setConfirm(null);
        toast.error(dialog.body);
        return;
      }
      setConfirm({ mode: "event", dialog, ticketIds: response.data.ticketIds });
    },
    onError: () => toast.error(t("couldnTCancelThisTicketPlease")),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({
      mode,
      wholePayment,
    }: {
      mode: "ticket" | "event";
      wholePayment: boolean;
      ids: string[];
    }) =>
      mode === "event"
        ? cancelEventTickets(eventId)
        : cancelUserTicket(
            ticketId,
            transactionId,
            wholePayment ? "payment" : "ticket",
          ),

    // Cancellation is a simple, user-confirmed status flip (see
    // cancelUserTicket.ts) that's highly likely to succeed and trivial to
    // undo, so the card leaves the Active list the moment the user
    // confirms rather than waiting on the round trip.
    onMutate: async ({ ids }) => {
      setConfirm(null);

      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<TicketsCache>(queryKey);

      queryClient.setQueryData<TicketsCache>(
        queryKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((ticket) => !ids.includes(ticket.id)),
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
        toast.error(response.message ?? t("couldnTCancelThisTicketPlease"));
      }
    },

    onError: (_error, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(t("couldnTCancelThisTicketPlease"));
    },

    onSettled: () => {
      invalidateTicketStatusQueries(queryClient);
      // A paid ticket's cancellation issues a partial refund
      // (cancelUserTicketCore -> issueRefundCore), which changes the
      // organizer's own ledger balance -- refresh their Finances screens
      // too, not just the buyer's ticket list.
      if (transactionId) invalidateOrganizerFinanceQueries(queryClient);
    },
  });

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("ticketOptions")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
            disabled={quote.isPending}
            onClick={() => {
              setMenuOpen(false);
              quote.mutate();
            }}
          >
            {menuLabel}
          </button>
        </PopoverContent>
      </Popover>

      {confirm?.dialog.confirm ? (
        <ConfirmDeleteModal
          title={
            confirm.mode === "event"
              ? confirm.dialog.title
              : t("cancelThisTicket")
          }
          message={confirm.dialog.body}
          confirmLabel={confirm.dialog.confirm}
          cancelLabel={confirm.dialog.keep}
          loadingLabel={t("cancelling")}
          isLoading={isPending || eventQuote.isPending}
          onConfirm={() =>
            mutate({
              mode: confirm.mode,
              wholePayment:
                confirm.mode === "ticket" && confirm.dialog.wholePayment,
              ids: confirm.ticketIds,
            })
          }
          onCancel={() => setConfirm(null)}
          extra={
            confirm.mode === "ticket" && confirm.dialog.allForEvent ? (
              <button
                type="button"
                disabled={eventQuote.isPending || isPending}
                onClick={() => eventQuote.mutate()}
                className="self-start text-sm font-semibold text-primary hover:underline disabled:opacity-60"
              >
                {confirm.dialog.allForEvent}
              </button>
            ) : null
          }
        />
      ) : null}
    </>
  );
}
