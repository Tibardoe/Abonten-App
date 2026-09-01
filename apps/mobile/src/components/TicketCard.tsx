import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { UserTicketType } from "@abonten/types/ticketType";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

export function TicketCard({
  ticket,
  showRefundInfo = false,
}: {
  ticket: UserTicketType;
  showRefundInfo?: boolean;
}) {
  const router = useRouter();
  // Refunds tab (web TicketsList `showRefundInfo`): the paid transaction's
  // refund state — "Refund requested" until Paystack settles it, else
  // "Refunded".
  const txn = (
    ticket as unknown as {
      transaction?: {
        status?: string;
        refund_requested_at?: string | null;
      } | null;
    }
  ).transaction;
  const refundLabel = showRefundInfo
    ? txn?.status === "refunded"
      ? "Refunded"
      : txn?.refund_requested_at
        ? "Refund requested"
        : "Refund pending"
    : null;
  const qr =
    ticket.qr_public_id && ticket.qr_version
      ? buildCloudinaryUrl(ticket.qr_public_id, ticket.qr_version, {
          width: 96,
          height: 96,
          lossless: true,
        })
      : null;

  const used = ticket.status === "used" || ticket.used_at != null;

  return (
    <Pressable
      className="flex-row gap-3 rounded-xl border border-border bg-card p-3 active:opacity-90"
      onPress={() => router.push(`/(app)/ticket/${ticket.id}`)}
    >
      {qr ? (
        <Image
          source={{ uri: qr }}
          style={{ width: 72, height: 72, borderRadius: 6 }}
          contentFit="contain"
        />
      ) : (
        <View className="h-[72px] w-[72px] items-center justify-center rounded-md bg-muted">
          <Text className="text-[10px] text-muted-foreground">no QR</Text>
        </View>
      )}

      <View className="flex-1 gap-1">
        <Text
          className="text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {ticket.event.title}
        </Text>
        {ticket.event.starts_at ? (
          <Text className="text-xs text-muted-foreground">
            {formatDateWithSuffix(ticket.event.starts_at)}
          </Text>
        ) : null}
        <View className="mt-1 flex-row items-center gap-2">
          <View
            className={`rounded-full px-2 py-0.5 ${used ? "bg-muted" : "bg-accent"}`}
          >
            <Text
              className={`text-[10px] font-semibold uppercase ${used ? "text-muted-foreground" : "text-accent-foreground"}`}
            >
              {used ? "used" : "active"}
            </Text>
          </View>
          <Text className="text-[10px] text-muted-foreground">
            {ticket.ticket_code}
          </Text>
        </View>
        {refundLabel ? (
          <Text className="text-[11px] font-medium text-warning">
            {refundLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
