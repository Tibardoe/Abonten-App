import { useTransactionDetail } from "@/features/transactions/useTransactionDetail";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { getRefundStatusLabel } from "@abonten/core/refundStatus";
import type { TransactionKind } from "@abonten/types/transactions";
import {
  AppText,
  Icon,
  type IoniconName,
  ScreenError,
  ScreenLoader,
} from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

// Native echo of the web /transactions/[kind]/[id] page: an amount banner, a
// status banner, and a labelled detail block. Same fields, same wording.

const STATUS_META: Record<
  string,
  {
    label: string;
    icon: IoniconName;
    tone: "success" | "muted" | "destructive";
  }
> = {
  paid: { label: "Paid", icon: "checkmark-circle-outline", tone: "success" },
  pending: { label: "Pending", icon: "time-outline", tone: "muted" },
  failed: {
    label: "Failed",
    icon: "close-circle-outline",
    tone: "destructive",
  },
  cancelled: {
    label: "Cancelled",
    icon: "close-circle-outline",
    tone: "destructive",
  },
  expired: { label: "Expired", icon: "close-circle-outline", tone: "muted" },
};

function Row({
  label,
  value,
}: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View className="flex-row items-center justify-between">
      <AppText variant="muted">{label}</AppText>
      <AppText variant="small">{String(value)}</AppText>
    </View>
  );
}

function dt(value: string) {
  const { date, time } = formatSingleDateTime(value);
  return `${date} ${time}`;
}

export default function TransactionDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const validKind =
    kind === "ticket" || kind === "subscription"
      ? (kind as TransactionKind)
      : undefined;
  const { data, isLoading, isError, refetch } = useTransactionDetail(
    validKind,
    id,
  );

  if (!validKind) return <ScreenError message="Unknown transaction type." />;
  if (isLoading) return <ScreenLoader />;
  if (isError || data === null || data === undefined) {
    return (
      <ScreenError
        message="This transaction could not be loaded."
        onRetry={() => refetch()}
      />
    );
  }

  const meta = STATUS_META[data.status] ?? STATUS_META.pending;
  const currency =
    data.kind === "ticket" ? (data.ticket_type?.currency ?? "GHS") : "GHS";
  const amount =
    data.kind === "ticket" && typeof data.totalPaid === "number"
      ? data.totalPaid
      : data.total_price;

  const contextualDate =
    data.status === "paid"
      ? data.completed_at
      : data.status === "pending"
        ? data.expires_at
        : data.created_at;
  const contextualLabel =
    data.status === "paid"
      ? "Completed"
      : data.status === "pending"
        ? "Expires"
        : "Date";

  const cancelled =
    data.kind === "ticket"
      ? data.tickets.filter((t) => t.status === "cancelled")
      : [];
  const refund =
    cancelled.length > 0 && cancelled[0].transaction
      ? getRefundStatusLabel(
          cancelled[0].transaction.status,
          cancelled[0].transaction.refund_requested_at,
        )
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-16"
    >
      <View className="flex-row items-center justify-between rounded-xl bg-muted p-4">
        <AppText variant="bodyStrong" className="text-muted-foreground">
          Amount
        </AppText>
        <AppText variant="bodyStrong">
          {currency} {Number(amount).toLocaleString()}
        </AppText>
      </View>

      <View className="flex-row items-center gap-3 rounded-xl bg-muted p-4">
        <Icon name={meta.icon} size={28} tone={meta.tone} />
        <View>
          <AppText variant="bodyStrong">{meta.label}</AppText>
          {contextualDate ? (
            <AppText variant="caption">
              {contextualLabel}: {dt(contextualDate)}
            </AppText>
          ) : null}
        </View>
      </View>

      <View className="gap-3 rounded-xl bg-muted p-4">
        {data.kind === "ticket" ? (
          <>
            <Row label="Event" value={data.event?.title ?? null} />
            <Row label="Ticket type" value={data.ticket_type?.type ?? null} />
            <Row label="Quantity" value={data.quantity} />
            <Row label="Unit price" value={`${currency} ${data.unit_price}`} />
            {data.discount > 0 ? (
              <Row label="Discount" value={`-${currency} ${data.discount}`} />
            ) : null}
            <Row
              label="Ticket price"
              value={`${currency} ${data.total_price}`}
            />
            {data.serviceFee > 0 ? (
              <Row
                label="Service fee"
                value={`${currency} ${data.serviceFee}`}
              />
            ) : null}
            {data.totalPaid !== data.total_price ? (
              <Row label="Total paid" value={`${currency} ${data.totalPaid}`} />
            ) : null}
            <Row label="Date/Time" value={dt(data.created_at)} />
            <Row
              label="Order reference"
              value={data.checkout_session_id ?? id}
            />
            {cancelled.length > 0 ? (
              <Row
                label="Cancelled"
                value={`${cancelled.length} of ${data.quantity}`}
              />
            ) : null}
            {refund ? <Row label="Refund" value={refund.label} /> : null}
          </>
        ) : (
          <>
            <Row label="Plan" value={data.subscription_plan_name} />
            <Row label="Unit price" value={`${currency} ${data.unit_price}`} />
            {data.discount > 0 ? (
              <Row label="Discount" value={`-${currency} ${data.discount}`} />
            ) : null}
            <Row
              label="Total price"
              value={`${currency} ${data.total_price}`}
            />
            <Row label="Date/Time" value={dt(data.created_at)} />
            <Row label="Reference" value={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
