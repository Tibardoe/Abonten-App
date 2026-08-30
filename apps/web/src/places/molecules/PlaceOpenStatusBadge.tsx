import type { PlaceOpenStatus } from "@abonten/core/computePlaceOpenStatus";

type PlaceOpenStatusBadgeProps = {
  status: PlaceOpenStatus;
  className?: string;
};

// Color is secondary reinforcement only, per the Places spec — the label
// text itself (computed in computePlaceOpenStatus.ts) always conveys
// open/closed, so a screen reader (which ignores the aria-hidden dot) still
// gets the full meaning from the text alone.
export default function PlaceOpenStatusBadge({
  status,
  className,
}: PlaceOpenStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${
        status.isOpen ? "text-primary" : "text-muted-foreground"
      } ${className ?? ""}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          status.isOpen ? "bg-primary" : "bg-destructive"
        }`}
      />
      {status.label}
    </span>
  );
}
