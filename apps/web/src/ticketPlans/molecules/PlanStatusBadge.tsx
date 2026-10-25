"use client";

import type {
  TicketPlanRefundStatus,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";
import { useTranslations } from "next-intl";

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
  awaiting_payment: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  active: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  settling: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired: "bg-muted text-muted-foreground",
  lapsed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/** The plan's state in a word or two; a refund under way says so. */
export default function PlanStatusBadge({
  status,
  refundStatus,
}: {
  status: TicketPlanStatus;
  refundStatus: TicketPlanRefundStatus;
}) {
  const t = useTranslations("ticketPlans");
  const refunding = refundStatus === "pending" || refundStatus === "failed";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}
    >
      {refunding
        ? t("statusRefunding")
        : refundStatus === "refunded"
          ? t("statusRefunded")
          : t(STATUS_KEY[status])}
    </span>
  );
}
