import { useCancelTicket } from "@/features/tickets/useCancelTicket";
import { useTicketDetail } from "@/features/tickets/useTicketDetail";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: ticket, isLoading, isError, refetch } = useTicketDetail(id);
  const cancel = useCancelTicket();

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

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !ticket) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          This ticket could not be loaded.
        </Text>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
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
  const used = ticket.status === "used" || ticket.used_at != null;
  const when = formatFullDateTimeRange(
    ticket.event.starts_at,
    ticket.event.ends_at,
  );

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
            <Text className="text-muted-foreground">No QR code</Text>
          </View>
        )}

        <View
          className={`rounded-full px-3 py-1 ${used ? "bg-muted" : "bg-accent"}`}
        >
          <Text
            className={`text-xs font-semibold uppercase ${used ? "text-muted-foreground" : "text-accent-foreground"}`}
          >
            {used ? "Used" : "Valid"}
          </Text>
        </View>

        <Text className="text-center text-lg font-bold text-foreground">
          {ticket.event.title}
        </Text>
        <Text className="text-xs tracking-widest text-muted-foreground">
          {ticket.ticket_code}
        </Text>
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
      </View>

      {used && ticket.used_at ? (
        <Text className="text-xs text-muted-foreground">
          Checked in{" "}
          {formatFullDateTimeRange(ticket.used_at, ticket.used_at).time}
        </Text>
      ) : null}

      <Pressable
        className="w-full items-center rounded-xl border border-border py-3 active:opacity-90"
        onPress={() => router.push(`/(app)/event/${ticket.event.id}`)}
      >
        <Text className="text-sm font-semibold text-foreground">
          View event
        </Text>
      </Pressable>

      {ticket.status === "active" ? (
        <Pressable
          disabled={cancel.isPending}
          className="w-full items-center rounded-xl border border-border py-3 active:opacity-90"
          onPress={onCancelTicket}
        >
          <Text className="text-sm font-semibold text-destructive">
            {cancel.isPending
              ? "Cancelling…"
              : ticket.transaction_id
                ? "Cancel ticket & request refund"
                : "Cancel ticket"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
}) {
  return (
    <View className="flex-row gap-3">
      <Ionicons name={icon} size={18} color="#888" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-sm text-foreground">{label}</Text>
        {sub ? (
          <Text className="text-xs text-muted-foreground">{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}
