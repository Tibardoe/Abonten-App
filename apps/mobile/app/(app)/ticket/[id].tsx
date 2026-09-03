import { AppHeader } from "@/components/app/AppHeader";
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
        <AppText variant="body">{label}</AppText>
        {sub ? <AppText variant="meta">{sub}</AppText> : null}
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
  const flyer =
    ticket.event.flyer_public_id && ticket.event.flyer_version
      ? buildCloudinaryUrl(
          ticket.event.flyer_public_id,
          ticket.event.flyer_version,
          { width: 900, height: 560 },
        )
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
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Ticket" backFallback="/(app)/tickets" />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-10"
      >
        {/* Flyer hero — makes the ticket recognisable at a glance */}
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {flyer ? (
            <Image
              source={{ uri: flyer }}
              style={{ width: "100%", aspectRatio: 16 / 10 }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              className="w-full items-center justify-center bg-muted"
              style={{ aspectRatio: 16 / 10 }}
            >
              <Icon name="image-outline" size={32} tone="muted" />
            </View>
          )}
          <View className="gap-2 p-4">
            <AppText variant="sectionTitle">{ticket.event.title}</AppText>
            <View className="flex-row items-center gap-2">
              <Icon name="calendar-outline" size={15} tone="muted" />
              <AppText variant="meta">
                {when.date} · {when.time}
              </AppText>
            </View>
            <View className="flex-row items-center gap-2">
              <Icon name="location-outline" size={15} tone="muted" />
              <AppText variant="meta" numberOfLines={1}>
                {ticket.event.address?.full_address ?? "Location unavailable"}
              </AppText>
            </View>
            <View className="mt-1">
              <TicketStatusBadge
                status={ticket.status}
                cancelledByOrganizer={cancelledByOrganizer}
                eventCancelled={cancelledByOrganizer}
                eventEnded={eventEnded}
              />
            </View>
          </View>
        </View>

        {/* Ticket details */}
        <View className="w-full gap-3 rounded-xl border border-border bg-card p-4">
          <Row icon="pricetag-outline" label={ticket.ticket_type.type} />
          {ticket.seat_number ? (
            <Row icon="grid-outline" label={`Seat ${ticket.seat_number}`} />
          ) : null}
          <Row
            icon="barcode-outline"
            label="Ticket reference"
            sub={ticket.ticket_code}
          />
          {used && ticket.used_at ? (
            <Row
              icon="checkmark-done-circle-outline"
              label="Checked in"
              sub={formatFullDateTimeRange(ticket.used_at, ticket.used_at).time}
            />
          ) : null}
        </View>

        {/* QR — still prominent for scanning */}
        <View className="w-full items-center gap-2 rounded-2xl border border-border bg-card p-6">
          {qr ? (
            <Image
              source={{ uri: qr }}
              style={{ width: 220, height: 220 }}
              contentFit="contain"
            />
          ) : (
            <View className="h-56 w-56 items-center justify-center rounded-lg bg-muted">
              <Icon name="qr-code-outline" size={40} tone="muted" />
              <AppText variant="meta" className="mt-2">
                No QR code
              </AppText>
            </View>
          )}
          <AppText variant="caption">Show this at entry</AppText>
          <AppText variant="meta" className="tracking-[3px]">
            {ticket.ticket_code}
          </AppText>
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
            <AppText variant="bodyStrong">View event</AppText>
          </Pressable>

          {canCancel ? (
            <Pressable
              accessibilityRole="button"
              disabled={cancel.isPending}
              className="min-h-[44px] items-center justify-center rounded-xl border border-border active:opacity-80"
              onPress={onCancelTicket}
            >
              <AppText variant="small" tone="error" className="font-semibold">
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
    </View>
  );
}
