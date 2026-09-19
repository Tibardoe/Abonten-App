import type { Database } from "./database.types";

// Row types of the organizer analytics RPCs, taken from the generated
// database types so the insight components and the Server Actions that feed
// them are checked against the real function signatures.

type Fn = Database["public"]["Functions"];

export type EventSalesTimelinePoint =
  Fn["get_event_sales_timeline"]["Returns"][number];

export type EventOverviewAnalytics =
  Fn["get_event_overview_analytics"]["Returns"][number];

export type EventPromoAnalyticsRow =
  Fn["get_event_promo_analytics"]["Returns"][number];

export type EventTicketTypeAnalyticsRow =
  Fn["get_event_ticket_type_analytics"]["Returns"][number];

export type EventDateAnalyticsRow =
  Fn["get_event_date_analytics"]["Returns"][number];

export type EventReturningAttendeeStats =
  Fn["get_event_returning_attendee_stats"]["Returns"][number];

export type OrganizerSalesTimelinePoint =
  Fn["get_organizer_sales_timeline"]["Returns"][number];
