import { formatMoney } from "@abonten/core/money/formatMoney";
import { planProgress } from "@abonten/core/ticketPlans/rules";
import type {
  TicketPlanRefundStatus,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";
import { AppText, ProgressBar } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// Small pieces the plan, Balance and Buy screens share.

const STATUS_KEY: Record<TicketPlanStatus, string> = {
  awaiting_payment: "statusAwaitingPayment",
  active: "statusActive",
  settling: "statusSettling",
  completed: "statusCompleted",
  expired: "statusExpired",
  lapsed: "statusLapsed",
  cancelled: "statusCancelled",
};

const TONE: Record<TicketPlanStatus, string> = {
  awaiting_payment: "bg-amber-500/15",
  active: "bg-sky-500/15",
  settling: "bg-sky-500/15",
  completed: "bg-emerald-500/15",
  expired: "bg-muted",
  lapsed: "bg-muted",
  cancelled: "bg-muted",
};

export function PlanStatusPill({
  status,
  refundStatus,
}: {
  status: TicketPlanStatus;
  refundStatus: TicketPlanRefundStatus;
}) {
  const t = useTranslations("ticketPlans");
  const refunding = refundStatus === "pending" || refundStatus === "failed";
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${TONE[status]}`}>
      <AppText variant="caption" className="font-medium">
        {refunding
          ? t("statusRefunding")
          : refundStatus === "refunded"
            ? t("statusRefunded")
            : t(STATUS_KEY[status])}
      </AppText>
    </View>
  );
}

/** "GH₵60.00 of GH₵210.00 paid" with a bar. */
export function PlanProgressBlock({
  paidMinor,
  totalMinor,
  currency,
}: {
  paidMinor: number;
  totalMinor: number;
  currency: string;
}) {
  const t = useTranslations("ticketPlans");
  const { locale } = useLocale();
  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency }, { locale });
  return (
    <View className="gap-1.5">
      <ProgressBar value={planProgress({ paidMinor, totalMinor })} />
      <AppText variant="small">
        {t.rich("paidOfTotal", {
          paid: say(paidMinor),
          total: say(totalMinor),
          strong: (chunks) => (
            <AppText variant="small" className="font-semibold">
              {chunks}
            </AppText>
          ),
        })}
      </AppText>
    </View>
  );
}
