import { cn } from "@/components/lib/utils";
import type { getRefundStatusLabel } from "@abonten/core/refundStatus";
import {
  MdCheckCircle,
  MdErrorOutline,
  MdInfoOutline,
  MdOutlineHourglassEmpty,
} from "react-icons/md";

type RefundBadge = NonNullable<ReturnType<typeof getRefundStatusLabel>>;

// Rendering-only wrapper around getRefundStatusLabel's existing
// label/className/description contract (src/utils/refundStatus.ts) -- adds
// an icon and a soft pill background so refund state doesn't rely on the
// text color alone, without touching the shared label-mapping logic itself.
const BADGE_STYLES: Record<
  string,
  { icon: typeof MdCheckCircle; background: string }
> = {
  "Refund pending": {
    icon: MdOutlineHourglassEmpty,
    background: "bg-amber-500/10",
  },
  "Refund issued": { icon: MdCheckCircle, background: "bg-green-500/10" },
  "Refund failed": { icon: MdErrorOutline, background: "bg-destructive/10" },
  "No refund yet": { icon: MdInfoOutline, background: "bg-muted" },
};

export default function RefundStatusBadge({
  badge,
}: {
  badge: RefundBadge;
}) {
  const style = BADGE_STYLES[badge.label] ?? {
    icon: MdInfoOutline,
    background: "bg-muted",
  };
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        style.background,
        badge.className,
      )}
    >
      <Icon className="text-sm" />
      {badge.label}
    </span>
  );
}
