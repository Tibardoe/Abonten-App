import { View } from "react-native";
import { AppText } from "./Typography";

// Native echo of the web status-pill family (TicketStatusBadge,
// RefundStatusBadge, PlaceOpenStatusBadge, …). `Badge` is the generic pill;
// `StatusBadge` maps the common domain statuses to a tone + label so screens
// don't re-derive them.

export type BadgeTone =
  | "default"
  | "accent"
  | "muted"
  | "success"
  | "warning"
  | "destructive"
  | "primary";

// Solid backgrounds only: the shared token colours are `hsl(var(--x))`
// without an `<alpha-value>` slot, so `/opacity` modifiers don't resolve
// reliably under NativeWind. Status is carried by the label + text colour,
// which also satisfies this project's "not colour alone" rule.
const TONE: Record<BadgeTone, { box: string; text: string }> = {
  default: { box: "bg-secondary", text: "text-secondary-foreground" },
  accent: { box: "bg-accent", text: "text-accent-foreground" },
  muted: { box: "bg-muted", text: "text-muted-foreground" },
  success: { box: "bg-muted", text: "text-success" },
  warning: { box: "bg-muted", text: "text-warning" },
  destructive: { box: "bg-muted", text: "text-destructive" },
  primary: { box: "bg-primary", text: "text-primary-foreground" },
};

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  uppercase?: boolean;
  className?: string;
};

export function Badge({
  label,
  tone = "muted",
  uppercase = true,
  className,
}: BadgeProps) {
  const t = TONE[tone];
  return (
    <View
      className={["self-start rounded-full px-2 py-1", t.box, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <AppText
        className={`text-[11px] font-semibold ${uppercase ? "uppercase" : ""} ${t.text}`}
      >
        {label}
      </AppText>
    </View>
  );
}

// Common domain statuses → pill. Extend as screens are ported; keep the
// label wording identical to the web copy.
const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  // event lifecycle
  published: { tone: "success", label: "Published" },
  draft: { tone: "muted", label: "Draft" },
  canceled: { tone: "destructive", label: "Canceled" },
  cancelled: { tone: "destructive", label: "Canceled" },
  completed: { tone: "muted", label: "Ended" },
  ended: { tone: "muted", label: "Ended" },
  // ticket lifecycle
  active: { tone: "accent", label: "Active" },
  used: { tone: "muted", label: "Used" },
  expired: { tone: "muted", label: "Expired" },
  // payment / refund
  successful: { tone: "success", label: "Successful" },
  pending: { tone: "warning", label: "Pending" },
  processing: { tone: "warning", label: "Processing" },
  failed: { tone: "destructive", label: "Failed" },
  refunded: { tone: "muted", label: "Refunded" },
  refund_pending: { tone: "warning", label: "Refund pending" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const entry = STATUS[status] ?? { tone: "muted" as BadgeTone, label: status };
  return <Badge label={entry.label} tone={entry.tone} className={className} />;
}
