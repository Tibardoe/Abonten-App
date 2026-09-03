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

// Back-compat shim: `StatusBadge` predates the shared status system. New code
// should use <StatusPill> (icon + tinted surface, driven by `resolveStatus`).
// Kept so existing call sites keep working.
export { StatusPill as StatusBadge } from "./StatusPill";
