import { useCancelTicket } from "@/features/tickets/useCancelTicket";
import { useTicketDetail } from "@/features/tickets/useTicketDetail";
import { useTicketReceipt } from "@/features/tickets/useTicketReceipt";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import {
  AppText,
  Button,
  Icon,
  type IoniconName,
  ScreenError,
  ScreenLoader,
  TicketStatusBadge,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, View } from "react-native";

function Row({
  icon,
  label,
  sub,
}: {
  icon: IoniconName;
  label: string;
  sub?: string;
}) {
  return (
    <View className="flex-row gap-3">
      <Icon name={icon} size={18} tone="muted" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <AppText className="text-[14px] text-foreground">{label}</AppText>
        {sub ? (
          <AppText className="text-[12px] text-muted-foreground">{sub}</AppText>
        ) : null}
      </View>
    </View>
  );
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: ticket, isLoading, isError, refetch } = useTicketDetail(id);
  const cancel = useCancelTicket();
  const receipt = useTicketReceipt();

  if (isLoading) return <ScreenLoader />;
  if (isError || !ticket) {
    return (
      <ScreenError
        message="This ticket could not be loaded."
        onRetry={() => refetch()}
      />
    );
  }

  const qr =
    ticket.qr_public_id && ticket.qr_version
      ? buildCloudinaryUrl(ticket.qr_public_id, ticket.qr_version, {
          width: 320,
          height: 320,
          lossless: true,
        })
      : null;
  const when = formatFullDateTimeRange(
    ticket.event.starts_at,
    ticket.event.ends_at,
  );
  const cancelledByOrganizer = ticket.event.status === "canceled";
  const eventEnded =
    getEventStatus(
      ticket.event.starts_at,
      ticket.event.ends_at,
      ticket.event.occurrences,
    ) === "ended";
  const used = ticket.status === "used" || ticket.used_at != null;
  const canCancel =
    ticket.status === "active" && !cancelledByOrganizer && !eventEnded;

  function onCancelTicket() {
    if (!ticket) return;
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
            if (res.status === 200) {
              Alert.alert("Ticket cancelled", res.message ?? "", [
                { text: "OK", onPress: () => router.back() },
              ]);
            } else {
              Alert.alert(
                "Couldn't cancel",
                res.message ?? "Please try again in a moment.",
              );
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="items-center gap-5 p-4 pb-10"
    >
      <View className="w-full items-center gap-4 rounded-2xl border border-border bg-card p-6">
        {qr ? (
          <Image
            source={{ uri: qr }}
            style={{ width: 240, height: 240 }}
            contentFit="contain"
          />
        ) : (
          <View className="h-60 w-60 items-center justify-center rounded-lg bg-muted">
            <Icon name="qr-code-outline" size={40} tone="muted" />
            <AppText className="mt-2 text-[12px] text-muted-foreground">
              No QR code
            </AppText>
          </View>
        )}

        <TicketStatusBadge
          status={ticket.status}
          cancelledByOrganizer={cancelledByOrganizer}
          eventCancelled={cancelledByOrganizer}
          eventEnded={eventEnded}
        />

        <AppText className="text-center text-[18px] font-bold text-foreground">
          {ticket.event.title}
        </AppText>
        <AppText className="text-[12px] tracking-[3px] text-muted-foreground">
          {ticket.ticket_code}
        </AppText>
      </View>

      <View className="w-full gap-3 rounded-xl border border-border bg-card p-4">
        <Row icon="pricetag-outline" label={ticket.ticket_type.type} />
        <Row icon="calendar-outline" label={when.date} sub={when.time} />
        <Row
          icon="location-outline"
          label={ticket.event.address?.full_address ?? "Location unavailable"}
        />
        {ticket.seat_number ? (
          <Row icon="grid-outline" label={`Seat ${ticket.seat_number}`} />
        ) : null}
        {used && ticket.used_at ? (
          <Row
            icon="checkmark-done-circle-outline"
            label="Checked in"
            sub={formatFullDateTimeRange(ticket.used_at, ticket.used_at).time}
          />
        ) : null}
      </View>

      <View className="w-full gap-3">
        <Button
          title={
            receipt.isGenerating
              ? "Preparing receipt…"
              : "Download receipt (PDF)"
          }
          fullWidth
          leftIcon="download-outline"
          onPress={() => receipt.downloadReceipt(ticket)}
          disabled={receipt.isGenerating}
          loading={receipt.isGenerating}
        />

        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-xl border border-border active:opacity-80"
          onPress={() => router.push(`/(app)/event/${ticket.event.id}`)}
        >
          <AppText className="text-[14px] font-semibold text-foreground">
            View event
          </AppText>
        </Pressable>

        {canCancel ? (
          <Pressable
            accessibilityRole="button"
            disabled={cancel.isPending}
            className="min-h-[44px] items-center justify-center rounded-xl border border-border active:opacity-80"
            onPress={onCancelTicket}
          >
            <AppText className="text-[14px] font-semibold text-destructive">
              {cancel.isPending
                ? "Cancelling…"
                : ticket.transaction_id
                  ? "Cancel ticket & request refund"
                  : "Cancel ticket"}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
