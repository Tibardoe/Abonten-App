import type { OrganizerLedgerTransactionLine } from "@/types/organizerFinance";
import type { IconType } from "react-icons";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle, IoMdTime } from "react-icons/io";
import { MdCancel } from "react-icons/md";

// Icon + label carry the meaning (never color alone), same accessibility
// approach as TransactionStatusIcon.tsx's STATUS_META map for the buyer
// transactions page.
const STATUS_META: Record<
  string,
  { Icon: IconType; colorClass: string; label: string }
> = {
  successful: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    label: "Successful",
  },
  completed: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    label: "Completed",
  },
  processed: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    label: "Processed",
  },
  processing: {
    Icon: IoMdTime,
    colorClass: "text-muted-foreground",
    label: "Processing",
  },
  failed: { Icon: MdCancel, colorClass: "text-destructive", label: "Failed" },
  cancelled: {
    Icon: BsFillDashCircleFill,
    colorClass: "text-muted-foreground",
    label: "Cancelled",
  },
};

export function getFinanceStatusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.processing;
}

export const LINE_LABELS: Record<OrganizerLedgerTransactionLine, string> = {
  ticket_sale: "Ticket sale",
  platform_fee: "Abonten fee",
  refund: "Refund",
  payout: "Organizer payout",
  payout_release: "Payout returned",
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
