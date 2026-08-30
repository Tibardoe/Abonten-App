import { cn } from "@/components/lib/utils";
import {
  MdCheckCircle,
  MdHistoryToggleOff,
  MdHowToReg,
  MdOutlineCancel,
} from "react-icons/md";

type TicketStatusBadgeProps = {
  /** Raw ticket.status from the DB -- active | used | expired | cancelled. */
  status: string;
  /** True when the organizer cancelled the whole event (vs. the attendee
   * cancelling just this ticket) -- both land on status="cancelled". */
  cancelledByOrganizer?: boolean;
  /** The event itself was cancelled by the organizer. A held ticket can
   * still read as status="active" in that case, so this overrides the
   * "Active" label -- you're not going to a cancelled event. */
  eventCancelled?: boolean;
  /** Every session of the event is now in the past. An un-cancelled,
   * not-checked-in ticket should read as "Ended", not "Active". */
  eventEnded?: boolean;
};

// Status is never color-only: every state pairs an icon with its own label,
// so it still reads correctly for colorblind users or in a quick glance.
// Handles all four real ticket.status values (see
// supabase/migrations/20260810084821_remote_schema.sql's ticket_status
// check) -- "expired" previously fell through and silently rendered as
// "Active".
export default function TicketStatusBadge({
  status,
  cancelledByOrganizer,
  eventCancelled,
  eventEnded,
}: TicketStatusBadgeProps) {
  const config = (() => {
    switch (status) {
      case "cancelled":
        return {
          label: cancelledByOrganizer ? "Cancelled by organizer" : "Cancelled",
          icon: MdOutlineCancel,
          className: "bg-destructive/10 text-destructive",
        };
      case "used":
        return {
          label: "Checked in",
          icon: MdHowToReg,
          className: "bg-success/10 text-success",
        };
      case "expired":
        return {
          label: "Expired",
          icon: MdHistoryToggleOff,
          className: "bg-muted text-muted-foreground",
        };
      default:
        // status is "active" (or an unrecognised value). The event's own
        // lifecycle can still make "Active" the wrong thing to say.
        if (eventCancelled) {
          return {
            label: "Event cancelled",
            icon: MdOutlineCancel,
            className: "bg-destructive/10 text-destructive",
          };
        }
        if (eventEnded) {
          return {
            label: "Ended",
            icon: MdHistoryToggleOff,
            className: "bg-muted text-muted-foreground",
          };
        }
        return {
          label: "Active",
          icon: MdCheckCircle,
          className: "bg-success/10 text-success",
        };
    }
  })();

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        config.className,
      )}
    >
      <Icon className="text-sm" />
      {config.label}
    </span>
  );
}
