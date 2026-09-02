import { useCancelTicket } from "@/features/tickets/useCancelTicket";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getRefundStatusLabel } from "@abonten/core/refundStatus";
import type { UserTicketType } from "@abonten/types/ticketType";
import { AppText, Icon, TicketStatusBadge } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Alert, Pressable, View } from "react-native";

// Native echo of the web My-Events TicketCard (TicketsList.tsx): the event
// flyer on top, then title + status badge, the ticket type / code line,
// an optional refund panel on the Refunds tab, and a View ticket / Cancel
// action row. Tapping the card opens the ticket detail (QR) screen.

export function TicketCard({
  ticket,
  showRefundInfo = false,
}: {
  ticket: UserTicketType;
  showRefundInfo?: boolean;
}) {
  const router = useRouter();
  const cancel = useCancelTicket();

  const event = ticket.event;
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 400,
          height: 192,
        })
      : null;

  const cancelledByOrganizer = event.status === "canceled";
  const eventEnded =
    getEventStatus(event.starts_at, event.ends_at, event.occurrences) ===
    "ended";

  const txn = ticket.transaction;
  const refundBadge =
    showRefundInfo && ticket.status === "cancelled" && txn
      ? getRefundStatusLabel(txn.status, txn.refund_requested_at)
      : null;
  const refundAmount = txn?.amount;

  const canCancel =
    ticket.status === "active" && !cancelledByOrganizer && !eventEnded;

  function onCancel() {
    const paid = ticket.transaction_id != null;
    Alert.alert(
      "Cancel this ticket?",
      paid
        ? "A refund of the ticket price will be issued to your original payment method. The Abonten service fee is not refunded."
        : "Are you sure you want to cancel this ticket?",
      [
        { text: "Keep ticket", style: "cancel" },
        {
          text: "Cancel ticket",
          style: "destructive",
          onPress: async () => {
            const res = await cancel.mutateAsync({
              ticketId: ticket.id,
              transactionId: ticket.transaction_id,
            });
            Alert.alert(
              res.status === 200 ? "Ticket cancelled" : "Couldn't cancel",
              res.message ??
                (res.status === 200 ? "" : "Please try again in a moment."),
            );
          },
        },
      ],
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title} ticket`}
      onPress={() => router.push(`/(app)/ticket/${ticket.id}`)}
      className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-95"
    >
      {flyer ? (
        <Image
          source={{ uri: flyer }}
          style={{ width: "100%", height: 144 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-36 items-center justify-center bg-muted">
          <Icon name="image-outline" size={22} tone="muted" />
        </View>
      )}

      <View className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <AppText
            className="flex-1 text-[16px] font-semibold text-foreground"
            numberOfLines={2}
          >
            {event.title}
          </AppText>
          <TicketStatusBadge
            status={ticket.status}
            cancelledByOrganizer={cancelledByOrganizer}
            eventCancelled={cancelledByOrganizer}
            eventEnded={eventEnded}
          />
        </View>

        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <AppText className="text-[12px] text-muted-foreground">
            {ticket.ticket_type.type}
          </AppText>
          <AppText className="text-[12px] tracking-widest text-muted-foreground">
            · {ticket.ticket_code}
          </AppText>
          {event.starts_at ? (
            <AppText className="text-[12px] text-muted-foreground">
              · {formatDateWithSuffix(event.starts_at)}
            </AppText>
          ) : null}
        </View>

        {refundBadge ? (
          <View className="gap-1 rounded-lg bg-muted p-2.5">
            <View className="flex-row items-center justify-between gap-2">
              <AppText className="text-[12px] font-semibold text-foreground">
                {refundBadge.label}
              </AppText>
              {refundAmount !== undefined ? (
                <AppText className="text-[13px] font-semibold text-foreground">
                  {txn?.currency} {refundAmount.toFixed(2)}
                </AppText>
              ) : null}
            </View>
            {refundBadge.description ? (
              <AppText className="text-[11px] text-muted-foreground">
                {refundBadge.description}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {showRefundInfo && ticket.status === "cancelled" && !txn ? (
          <AppText className="text-[12px] text-muted-foreground">
            No payment on this ticket — nothing to refund.
          </AppText>
        ) : null}

        <View className="flex-row items-center justify-between gap-2 pt-1">
          <View className="flex-row items-center gap-1">
            <Icon name="qr-code-outline" size={16} tone="primary" />
            <AppText className="text-[13px] font-semibold text-primary">
              View ticket
            </AppText>
          </View>

          {canCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel ticket"
              disabled={cancel.isPending}
              onPress={onCancel}
              className="min-h-[36px] justify-center rounded-lg border border-border px-3 active:opacity-70"
            >
              <AppText className="text-[13px] font-semibold text-destructive">
                {cancel.isPending ? "Cancelling…" : "Cancel"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
