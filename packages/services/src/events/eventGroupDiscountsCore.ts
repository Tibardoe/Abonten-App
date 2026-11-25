// An event's automatic group prices ("10 or more tickets: 10% off"), set
// by its organizer (docs/architecture/group-tickets-and-prices.md). Shared
// by the web action setEventGroupDiscounts and
// PUT /api/mobile/organizer/events/:eventId/group-prices.
//
// Unlike ticket types, group prices stay editable after the first sale: a
// checkout is priced when it is made, so a change only affects later
// orders. Removing them all needs no switch; adding them needs the
// tickets.group_pricing flag for the organizer.

import type { GroupDiscountTier } from "@abonten/core/checkoutPricing";
import {
  groupPricingProblemMessage,
  sortGroupDiscountTiers,
} from "@abonten/core/groupPricing";
import { logger } from "@abonten/core/logger";
import { hasFreeRegistration } from "@abonten/core/ticketTiers";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gatePartnerLockRefusal } from "../gatePartners/gatePartnerConfig";
import { coreT, tr } from "../i18n/requestLocale";
import {
  groupPricingProblem,
  replaceEventGroupDiscounts,
} from "./groupPricingAccess";

export type SetEventGroupDiscountsResult =
  | { status: 200; message: string; data: GroupDiscountTier[] }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

export async function setEventGroupDiscountsCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  input: { eventId: string; tiers: GroupDiscountTier[] },
): Promise<SetEventGroupDiscountsResult> {
  // The caller's own client: the organizer (or a team member acting for
  // it) can read the event; anyone else gets nothing.
  const { data: event, error } = await supabase
    .from("event")
    .select("id, status, ticket_type(type)")
    .eq("id", input.eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();

  if (error) {
    logger.error(
      `setEventGroupDiscounts: event read failed (${error.message})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!event) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }
  if (event.status === "canceled") {
    return { status: 409, message: tr("thisEventHasBeenCanceled") };
  }
  const gateLocked = await gatePartnerLockRefusal(input.eventId, "edit");
  if (gateLocked) return gateLocked;

  const tiers = sortGroupDiscountTiers(input.tiers);
  const problem = await groupPricingProblem(accountId, {
    freeEvent: hasFreeRegistration(event.ticket_type ?? []),
    tiers: [],
    groupDiscounts: tiers,
  });
  if (problem) {
    return {
      status: problem === "not_enabled" ? 403 : 400,
      message: groupPricingProblemMessage(coreT(), problem),
    };
  }

  const writeError = await replaceEventGroupDiscounts(input.eventId, tiers);
  if (writeError) {
    logger.error(`setEventGroupDiscounts: write failed (${writeError})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return {
    status: 200,
    message: tr("groupPricesSaved"),
    data: tiers,
  };
}
