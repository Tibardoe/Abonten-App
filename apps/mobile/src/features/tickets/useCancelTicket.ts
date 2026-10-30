import { api } from "@/lib/api";
import { invalidateAfterTicketMutation } from "@/lib/ticketMutationInvalidation";
import type {
  CancelTicketBody,
  TicketCancelQuoteBody,
} from "@abonten/api-client";
import { ticketCancelDialog } from "@abonten/core/ticketCancelQuote";
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

/** What cancelling would give back, asked before the dialog opens. */
export function useTicketCancelQuote() {
  return useMutation({
    mutationFn: (body: TicketCancelQuoteBody) => api.tickets.cancelQuote(body),
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

  const failed = (message?: string) =>
    toast.error(t("couldnTCancel"), {
      description: message ?? t("pleaseTryAgainInAMoment"),
    });

  async function start(
    ticket: { id: string; transaction_id: string | null },
    onCancelled: (message: string) => void,
  ) {
    if (quote.isPending || cancel.isPending) return;
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

  return { start, pending: quote.isPending || cancel.isPending };
}
