import { purchasesLeft } from "@abonten/core/checkoutPricing";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { groupPricingEnabledFor } from "./groupPricingAccess";

// Post-auth body of getEventForEdit, lifted so the mobile
// GET /api/mobile/organizer/events/:id/edit route prefills its edit form
// from the exact same owner-scoped fetch as the web edit modal.
// Deliberately NOT a "use server" file.

export type EventForEditData = {
  id: string;
  title: string;
  description: string;
  address: { full_address?: string } | null;
  capacity: number | null;
  website_url: string | null;
  event_category: string | null;
  event_type: string[] | string | null;
  require_registration: boolean | null;
  featured: boolean | null;
  /** @abonten/core/refundPolicy (absent from an older server). */
  refund_policy?: string | null;
  refund_cutoff_hours?: number | null;
  /** @abonten/core/eventPurchaseEligibility (absent from an older server). */
  sales_close_before_end_minutes?: number | null;
  starts_at: string | null;
  ends_at: string | null;
  flyer_public_id: string;
  flyer_version: string;
  event_occurrence: { id: string; starts_at: string; ends_at: string }[] | null;
  ticket_type:
    | {
        id: string;
        type: string;
        price: number;
        /** Purchases left (a Couple counts once), as the form edits them. */
        quantity: number | null;
        /** People one purchase admits (a Couple: 2). */
        admits: number;
        currency: string | null;
        available_from: string | null;
        available_until: string | null;
        /** What the ticket includes (@abonten/core/ticketTypeNote). */
        description: string | null;
      }[]
    | null;
  /** Automatic group prices, smallest group first. */
  event_group_discount: { min_tickets: number; percent_off: number }[] | null;
  /** Group tickets and group prices are switched on for this organizer. */
  group_pricing_enabled: boolean;
};

export type EventForEditResult =
  | { status: 404; message: string }
  | { status: 200; data: EventForEditData };

export async function getEventForEditCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<EventForEditResult> {
  const { data: event, error } = await supabase
    .from("event")
    .select(
      `
      id,
      title,
      currency,
      timezone,
      country_code,
      description,
      address,
      capacity,
      website_url,
      event_category,
      event_type,
      require_registration,
      featured,
      refund_policy,
      refund_cutoff_hours,
      sales_close_before_end_minutes,
      starts_at,
      ends_at,
      flyer_public_id,
      flyer_version,
      event_occurrence(id, starts_at, ends_at),
      ticket_type(id, type, price, quantity, admits, currency, available_from, available_until, description),
      event_group_discount(min_tickets, percent_off)
    `,
    )
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .single();

  if (error || !event) {
    return {
      status: 404,
      message: tr("eventNotFoundOrUnauthorized"),
    };
  }

  const row = event as unknown as EventForEditData;
  // The stock is stored in places (people); the form edits purchases.
  const ticketTypes = (row.ticket_type ?? []).map((tier) => ({
    ...tier,
    admits: tier.admits ?? 1,
    quantity: purchasesLeft(tier.quantity, tier.admits),
  }));
  const groupDiscounts = [...(row.event_group_discount ?? [])].sort(
    (a, b) => a.min_tickets - b.min_tickets,
  );

  return {
    status: 200,
    data: {
      ...row,
      ticket_type: ticketTypes,
      event_group_discount: groupDiscounts,
      group_pricing_enabled: await groupPricingEnabledFor(userId),
    },
  };
}
