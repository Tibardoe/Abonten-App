import { formatMoney } from "@abonten/core/formatMoney";
import {
  type RefundStatusKind,
  getRefundStatusKind,
  getRefundStatusLabel,
} from "@abonten/core/refundStatus";
import {
  AppText,
  Icon,
  type IoniconName,
  StatusPill,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// §10 — one place that turns a cancelled ticket's transaction state into a
// clear "here's what's happening with your money" panel, used on both the
// Tickets list card and the ticket detail screen. Only the four states the
// backend actually produces (see @abonten/core/refundStatus): Refund
// pending / Refund issued / Refund failed / No refund yet. Each pairs the
// shared StatusPill with an icon, the amount, and a plain-English line
// answering "is my money coming back / do I need to do anything?".

type Meta = { pillStatus: string; icon: IoniconName };

const META: Record<RefundStatusKind, Meta> = {
  pending: { pillStatus: "refund_pending", icon: "time-outline" },
  issued: { pillStatus: "refunded", icon: "checkmark-circle" },
  failed: { pillStatus: "failed", icon: "alert-circle" },
  none: { pillStatus: "pending", icon: "information-circle-outline" },
};

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
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const kind = getRefundStatusKind(
    transactionStatus ?? "",
    refundRequestedAt ?? null,
  );
  const core = getRefundStatusLabel(
    tc,
    transactionStatus ?? "",
    refundRequestedAt ?? null,
  );
  if (!kind || !core) return null;

  const meta = META[kind];

  return (
    <View className="gap-2 rounded-xl border border-border bg-muted p-3">
      <View className="flex-row items-center justify-between gap-2">
        <StatusPill
          status={meta.pillStatus}
          options={{ label: core.label }}
          size="sm"
        />
        {typeof amount === "number" ? (
          <AppText variant="bodyStrong">
            {formatMoney(currency, amount)}
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
          {t(`refundNext.${kind}`)}
        </AppText>
      </View>
    </View>
  );
}
