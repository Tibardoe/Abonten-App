import { useRequestTicketRefund } from "@/features/tickets/useCancelTicket";
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
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

// §10 — one place that turns a cancelled ticket's refund state (its own
// refund, else its payment's: refundStatus.ticketRefundState) into a
// clear "here's what's happening with your money" panel, used on both the
// Tickets list card and the ticket detail screen. A refused refund, or one
// never asked for, can be asked for again from here (transactionId). Only the four states the
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
  transactionId,
}: {
  transactionStatus: string | null | undefined;
  refundRequestedAt: string | null | undefined;
  amount: number | null | undefined;
  currency: string | null | undefined;
  transactionId?: string | null;
}) {
  const { locale } = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const toast = useToast();
  const request = useRequestTicketRefund();
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
            {formatMoney(currency, amount, { locale })}
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
      {transactionId && (kind === "failed" || kind === "none") ? (
        <Pressable
          accessibilityRole="button"
          disabled={request.isPending}
          onPress={async () => {
            const res = await request
              .mutateAsync({ transactionId })
              .catch(() => null);
            if (res?.status === 200) toast.success(res.message ?? "");
            else toast.error(res?.message ?? t("couldnTRetryTheRefundPlease"));
          }}
          className="self-start py-1 active:opacity-60"
        >
          <AppText variant="small" tone="brand" className="font-semibold">
            {request.isPending
              ? t("retrying")
              : kind === "failed"
                ? t("retryRefund")
                : t("requestRefund")}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
