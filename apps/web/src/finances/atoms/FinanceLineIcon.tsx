import type { OrganizerLedgerTransactionLine } from "@abonten/types/organizerFinance";
import type { IconType } from "react-icons";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle, IoMdTime } from "react-icons/io";
import { MdCancel } from "react-icons/md";

// Icon + label carry the meaning (never color alone), same accessibility
// approach as TransactionStatusIcon.tsx's STATUS_META map for the buyer
// transactions page.
const STATUS_META: Record<
  string,
  { Icon: IconType; colorClass: string; labelKey: string }
> = {
  successful: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    labelKey: "status.successful",
  },
  completed: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    labelKey: "status.completed",
  },
  processed: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    labelKey: "status.processed",
  },
  processing: {
    Icon: IoMdTime,
    colorClass: "text-muted-foreground",
    labelKey: "status.processing",
  },
  pending: {
    Icon: IoMdTime,
    colorClass: "text-muted-foreground",
    labelKey: "status.pendingUntilTheEventSettles",
  },
  failed: {
    Icon: MdCancel,
    colorClass: "text-destructive",
    labelKey: "status.failed",
  },
  cancelled: {
    Icon: BsFillDashCircleFill,
    colorClass: "text-muted-foreground",
    labelKey: "status.cancelled",
  },
};

export function getFinanceStatusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.processing;
}

// Catalog keys in the finances namespace.
export const LINE_LABEL_KEYS: Record<OrganizerLedgerTransactionLine, string> = {
  ticket_sale: "line.ticketSale",
  platform_fee: "line.platformFee",
  refund: "line.refund",
  refund_release: "line.refundRelease",
  payout: "line.payout",
  payout_release: "line.payoutRelease",
  promoter_commission: "line.promoterCommission",
  promoter_commission_reversal: "line.promoterCommissionReversal",
};

export default function FinanceLineIcon({
  status,
  className = "text-2xl",
}: {
  status: string;
  className?: string;
}) {
  const { Icon, colorClass } = getFinanceStatusMeta(status);
  return <Icon aria-hidden="true" className={`${className} ${colorClass}`} />;
}
