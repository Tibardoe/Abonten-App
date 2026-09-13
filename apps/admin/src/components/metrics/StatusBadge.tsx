import {
  type StatusFamily,
  statusMeta,
} from "@abonten/core/admin/statusLabels";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  PauseCircle,
  Undo2,
  XCircle,
} from "lucide-react";
import { Badge } from "../ui";

// Every enum the console shows goes through here, so `refund_hold` reads as
// "Refund deducted" on the ledger, the payouts list and the organizer page
// alike — and so the meaning is carried by the word and the icon, not by the
// colour on its own.

const ICONS = {
  check: CheckCircle2,
  clock: Clock,
  x: XCircle,
  alert: AlertTriangle,
  pause: PauseCircle,
  dot: Circle,
  undo: Undo2,
  flag: Flag,
} as const;

export function StatusBadge({
  family,
  value,
  showIcon = true,
  className,
}: {
  family: StatusFamily;
  value: string | number | null | undefined;
  showIcon?: boolean;
  className?: string;
}) {
  const meta = statusMeta(family, value);
  const Icon = ICONS[meta.icon];
  return (
    <Badge tone={meta.tone} className={className}>
      {showIcon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {meta.label}
    </Badge>
  );
}
