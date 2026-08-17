import type { TransactionStatus } from "@/types/transactions";
import type { IconType } from "react-icons";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle, IoMdTime } from "react-icons/io";
import { MdCancel } from "react-icons/md";

// Single source of truth mapping status -> {Icon, colorClass, label}, reused
// by the summary tiles, list rows, and detail page so an icon/status-label
// pairing is never duplicated or drifts. Icons carry the meaning (never
// color alone) per the accessibility requirement for this page.
const STATUS_META: Record<
  TransactionStatus,
  {
    Icon: IconType;
    colorClass: string;
    label: string;
  }
> = {
  paid: {
    Icon: IoMdCheckmarkCircle,
    colorClass: "text-primary",
    label: "Successful",
  },
  pending: {
    Icon: IoMdTime,
    colorClass: "text-muted-foreground",
    label: "Pending",
  },
  failed: { Icon: MdCancel, colorClass: "text-destructive", label: "Failed" },
  cancelled: {
    Icon: BsFillDashCircleFill,
    colorClass: "text-muted-foreground",
    label: "Cancelled",
  },
  expired: {
    Icon: BsFillDashCircleFill,
    colorClass: "text-muted-foreground",
    label: "Expired",
  },
};

export function getTransactionStatusMeta(status: TransactionStatus) {
  return STATUS_META[status] ?? STATUS_META.pending;
}

export default function TransactionStatusIcon({
  status,
  className = "text-2xl md:text-3xl",
}: {
  status: TransactionStatus;
  className?: string;
}) {
  const { Icon, colorClass } = getTransactionStatusMeta(status);
  return <Icon aria-hidden="true" className={`${className} ${colorClass}`} />;
}
