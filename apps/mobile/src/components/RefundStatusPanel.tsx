import { getRefundStatusLabel } from "@abonten/core/refundStatus";
import {
  AppText,
  Icon,
  type IoniconName,
  StatusPill,
} from "@abonten/ui-native";
import { View } from "react-native";

// §10 — one place that turns a cancelled ticket's transaction state into a
// clear "here's what's happening with your money" panel, used on both the
// Tickets list card and the ticket detail screen. Only the four states the
// backend actually produces (see @abonten/core/refundStatus): Refund
// pending / Refund issued / Refund failed / No refund yet. Each pairs the
// shared StatusPill with an icon, the amount, and a plain-English line
// answering "is my money coming back / do I need to do anything?".

type Meta = {
  pillStatus: string;
  pillLabel: string;
  icon: IoniconName;
  nextStep: string;
};

function metaFor(label: string, coreDescription?: string): Meta {
  switch (label) {
    case "Refund pending":
      return {
        pillStatus: "refund_pending",
        pillLabel: "Refund pending",
        icon: "time-outline",
        nextStep:
          "Your refund is on its way to your original payment method — this usually takes a few business days. Nothing more is needed from you.",
      };
    case "Refund issued":
      return {
        pillStatus: "refunded",
        pillLabel: "Refund issued",
        icon: "checkmark-circle",
        nextStep:
          "This was refunded to your original payment method. It can take a few business days to show on your statement.",
      };
    case "Refund failed":
      return {
        pillStatus: "failed",
        pillLabel: "Refund failed",
        icon: "alert-circle",
        nextStep:
          "We couldn't complete the refund automatically. Our team has been notified and will resolve it — you don't need to do anything.",
      };
    default:
      // "No refund yet"
      return {
        pillStatus: "pending",
        pillLabel: "No refund yet",
        icon: "information-circle-outline",
        nextStep:
          coreDescription ??
          "A refund is issued once every ticket in this order is cancelled.",
      };
  }
}

export function RefundStatusPanel({
  transactionStatus,
  refundRequestedAt,
  amount,
  currency,
}: {
  transactionStatus: string | null | undefined;
  refundRequestedAt: string | null | undefined;
  amount: number | null | undefined;
  currency: string | null | undefined;
}) {
  const core = getRefundStatusLabel(
    transactionStatus ?? "",
    refundRequestedAt ?? null,
  );
  if (!core) return null;

  const meta = metaFor(core.label, core.description);

  return (
    <View className="gap-2 rounded-xl border border-border bg-muted p-3">
      <View className="flex-row items-center justify-between gap-2">
        <StatusPill
          status={meta.pillStatus}
          options={{ label: meta.pillLabel }}
          size="sm"
        />
        {typeof amount === "number" ? (
          <AppText variant="bodyStrong">
            {currency ?? "GHS"} {amount.toFixed(2)}
          </AppText>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        <Icon
          name={meta.icon}
          size={14}
          tone="muted"
          style={{ marginTop: 2 }}
        />
        <AppText variant="caption" className="flex-1">
          {meta.nextStep}
        </AppText>
      </View>
    </View>
  );
}
