import { api } from "@/lib/api";
import { invalidateAfterTicketMutation } from "@/lib/ticketMutationInvalidation";
import type {
  CancelTicketBody,
  EventTicketsBody,
  RequestTicketRefundBody,
  TicketCancelQuoteBody,
} from "@abonten/api-client";
import {
  eventCancelDialog,
  ticketCancelDialog,
} from "@abonten/core/ticketCancelQuote";
import { useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

// Native echo of the web CancelUserTicketBtn. Scope "payment" also cancels
// the other tickets the same payment bought, which a refund needs. Server
// never throws — callers branch on `status`.
export function useCancelTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CancelTicketBody) => api.tickets.cancel(body),
    onSuccess: (res) => {
      if (res.status !== 200) return;
      // Cancelling frees the spot back: the discovery/explore cards, the
      // "You're going" badge, event detail and the organizer's attendee
      // list all need to reflect it — same fan-out as a purchase.
      invalidateAfterTicketMutation(qc);
    },
  });
}

/** Asks again for a cancelled ticket's refund (refused, or never asked). */
export function useRequestTicketRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RequestTicketRefundBody) =>
      api.tickets.requestRefund(body),
    onSuccess: (res) => {
      if (res.status === 200) invalidateAfterTicketMutation(qc);
    },
  });
}

/** What cancelling would give back, asked before the dialog opens. */
export function useTicketCancelQuote() {
  return useMutation({
    mutationFn: (body: TicketCancelQuoteBody) => api.tickets.cancelQuote(body),
  });
}

/** What cancelling all of the caller's tickets for an event gives back. */
export function useEventCancelQuote() {
  return useMutation({
    mutationFn: (body: EventTicketsBody) => api.tickets.eventCancelQuote(body),
  });
}

/** Cancels every active ticket the caller holds for an event. */
export function useCancelEventTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EventTicketsBody) => api.tickets.cancelEvent(body),
    onSuccess: (res) => {
      if (res.status === 200) invalidateAfterTicketMutation(qc);
    },
  });
}

/**
 * Cancel from the ticket screen or a ticket card: asks what cancelling
 * gives back, says it in the dialog (a ticket paid for together with
 * others goes with them), then cancels. `onCancelled` gets the server's
 * message; failures are toasted here.
 */
export function useCancelTicketFlow() {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const quote = useTicketCancelQuote();
  const cancel = useCancelTicket();
  const eventQuote = useEventCancelQuote();
  const cancelEvent = useCancelEventTickets();
  const busy =
    quote.isPending ||
    cancel.isPending ||
    eventQuote.isPending ||
    cancelEvent.isPending;

  const failed = (message?: string) =>
    toast.error(t("couldnTCancel"), {
      description: message ?? t("pleaseTryAgainInAMoment"),
    });

  // "Cancel all N for this event": what that gives back, then confirm.
  async function startEvent(
    eventId: string,
    onCancelled: (message: string) => void,
  ) {
    const res = await eventQuote.mutateAsync({ eventId }).catch(() => null);
    if (!res || res.status !== 200) {
      failed(res?.message);
      return;
    }
    const dialog = eventCancelDialog({ locale, t: tc }, res.data);
    if (!dialog.confirm) {
      Alert.alert(dialog.title, dialog.body, [{ text: "OK" }]);
      return;
    }
    Alert.alert(dialog.title, dialog.body, [
      { text: dialog.keep, style: "cancel" },
      {
        text: dialog.confirm,
        style: "destructive",
        onPress: async () => {
          const done = await cancelEvent
            .mutateAsync({ eventId })
            .catch(() => null);
          if (done?.status === 200) onCancelled(done.message ?? "");
          else failed(done?.message);
        },
      },
    ]);
  }

  async function start(
    ticket: { id: string; transaction_id: string | null; eventId: string },
    onCancelled: (message: string) => void,
  ) {
    if (busy) return;
    const res = await quote
      .mutateAsync({ ticketId: ticket.id })
      .catch(() => null);
    if (!res || res.status !== 200) {
      failed(res?.message);
      return;
    }
    const dialog = ticketCancelDialog({ locale, t: tc }, res.data);
    if (!dialog.confirm) {
      Alert.alert(t("cancelThisTicket"), dialog.body, [{ text: "OK" }]);
      return;
    }
    Alert.alert(t("cancelThisTicket"), dialog.body, [
      { text: dialog.keep, style: "cancel" },
      ...(dialog.allForEvent
        ? [
            {
              text: dialog.allForEvent,
              onPress: () => startEvent(ticket.eventId, onCancelled),
            },
          ]
        : []),
      {
        text: dialog.confirm,
        style: "destructive",
        onPress: async () => {
          const done = await cancel
            .mutateAsync({
              ticketId: ticket.id,
              transactionId: ticket.transaction_id,
              scope: dialog.wholePayment ? "payment" : "ticket",
            })
            .catch(() => null);
          if (done?.status === 200) onCancelled(done.message ?? "");
          else failed(done?.message);
        },
      },
    ]);
  }

  return { start, pending: busy };
}
