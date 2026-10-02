import type { OrganizerAttentionRow } from "@abonten/types/eventAnalytics";
import { formatDate } from "./i18n/format";
import type { CoreTranslator } from "./i18n/translator";
import { ticketTypeLabel } from "./ticketTiers";

// What the organizer dashboard says under "Needs attention", in the
// reader's language. get_organizer_needs_attention returns which rule
// fired and the facts behind it (when the event starts and in which zone,
// how many tickets are sold or left); the sentence is made here, so web
// and mobile say the same thing. Words live under `needsAttention.*` of
// the core namespace.
//
// The database also sends an English sentence (`message`). It is what app
// versions from before 2026-10-02 print, and what this falls back to when
// the facts are missing (a database that has not had the migration yet).

type Facts = Pick<OrganizerAttentionRow, "rule_type" | "message"> &
  Partial<
    Pick<
      OrganizerAttentionRow,
      "starts_at" | "timezone" | "sold" | "remaining" | "ticket_type"
    >
  >;

export function organizerNeedsAttentionText(
  t: CoreTranslator,
  row: Facts,
  locale?: string | null,
): string {
  // The day in the event's own zone: an event starting just after midnight
  // in Accra is "6 Oct" there whatever the server's clock says.
  const date = row.starts_at
    ? formatDate(row.starts_at, locale, {
        month: "short",
        day: "numeric",
        ...(row.timezone ? { timeZone: row.timezone } : {}),
      })
    : "";

  if (row.rule_type === "no_sales_yet" && date) {
    return t("needsAttention.noSalesYet", { date });
  }
  if (row.rule_type === "low_registrations" && date && row.sold != null) {
    return t("needsAttention.lowSales", { date, sold: row.sold });
  }
  if (
    row.rule_type === "nearly_sold_out" &&
    row.ticket_type &&
    row.remaining != null
  ) {
    return t("needsAttention.nearlySoldOut", {
      type: ticketTypeLabel(t, row.ticket_type),
      remaining: row.remaining,
    });
  }
  return row.message;
}
