import { View } from "react-native";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";

// Native echo of apps/web/src/components/atoms/TicketStatusBadge.tsx.
// Status is never colour-only: every state pairs an icon with its own
// label. Handles the four real ticket.status values (active | used |
// expired | cancelled) plus the event-lifecycle overrides that can make
// "Active" the wrong thing to say for a still-held ticket.

export type TicketStatusBadgeProps = {
  /** Raw ticket.status — active | used | expired | cancelled. */
  status: string;
  /** Organizer cancelled the whole event (vs. the attendee cancelling
   * just this ticket) — both land on status="cancelled". */
  cancelledByOrganizer?: boolean;
  /** The event itself was cancelled by the organizer — overrides "Active"
   * on a still-held ticket. */
  eventCancelled?: boolean;
  /** Every session of the event is in the past — reads as "Ended". */
  eventEnded?: boolean;
  className?: string;
};

type Config = {
  label: string;
  icon: IoniconName;
  box: string;
  text: string;
};

function resolve({
  status,
  cancelledByOrganizer,
  eventCancelled,
  eventEnded,
}: TicketStatusBadgeProps): Config {
  switch (status) {
    case "cancelled":
      return {
        label: cancelledByOrganizer ? "Cancelled by organizer" : "Cancelled",
        icon: "close-circle",
        box: "bg-muted",
        text: "text-destructive",
      };
    case "used":
      return {
        label: "Checked in",
        icon: "checkmark-done-circle",
        box: "bg-muted",
        text: "text-success",
      };
    case "expired":
      return {
        label: "Expired",
        icon: "time-outline",
        box: "bg-muted",
        text: "text-muted-foreground",
      };
    default:
      if (eventCancelled)
        return {
          label: "Event cancelled",
          icon: "close-circle",
          box: "bg-muted",
          text: "text-destructive",
        };
      if (eventEnded)
        return {
          label: "Ended",
          icon: "time-outline",
          box: "bg-muted",
          text: "text-muted-foreground",
        };
      return {
        label: "Active",
        icon: "checkmark-circle",
        box: "bg-muted",
        text: "text-success",
      };
  }
}

export function TicketStatusBadge(props: TicketStatusBadgeProps) {
  const c = resolve(props);
  const tone =
    c.text === "text-destructive"
      ? "destructive"
      : c.text === "text-success"
        ? "success"
        : "muted";

  return (
    <View
      className={[
        "flex-row items-center gap-1 self-start rounded-full px-2.5 py-1",
        c.box,
        props.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon name={c.icon} size={13} tone={tone} />
      <AppText className={`text-[11px] font-semibold ${c.text}`}>
        {c.label}
      </AppText>
    </View>
  );
}
