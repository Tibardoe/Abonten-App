"use server";

import { createClient } from "@/config/supabase/server";
import { computeLineAmount } from "@/utils/checkoutPricing";
import { logger } from "@/utils/logger";
import { adjustPromoUsageUnits } from "@/utils/promoUsage";
import {
  releaseTicketQuantity,
  reserveTicketQuantity,
} from "@/utils/ticketInventory";

type CheckoutRow = {
  id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price: number;
  discounted_units: number;
  promo_code: string | null;
  status: string;
};

/**
 * Server-authoritative quantity change for ONE line item of a pending
 * checkout (the [-]/[+] stepper in the order-summary basket) — the same
 * row granularity deleteTicketSummaryCheckout already uses. newQuantity < 1
 * is rejected: removing a line entirely is deleteTicketSummaryCheckout's job,
 * not this action's.
 *
 * Promo eligibility uses a "sticky, delta-only" rule rather than
 * reallocating the whole session on every edit: units the row already had
 * discounted stay discounted; only the newly added (or removed) units are
 * evaluated against the promo's remaining capacity. This matches the
 * checkout-creation behavior for the tickets a buyer adds later, without
 * needing a stable "first claimed" order across a session's rows — which
 * doesn't exist (ticket_checkout.id is a random UUID and a session's rows
 * share one created_at from their batch insert).
 */
export default async function updateTicketCheckoutQuantity(
  ticketCheckoutId: string,
  newQuantity: number,
) {
  if (!Number.isInteger(newQuantity) || newQuantity < 1) {
    return {
      status: 400,
      message: "Quantity must be at least 1 — remove the item to take it out.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data: rawCheckout, error: checkoutError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, ticket_type_id, quantity, unit_price, discounted_units, promo_code, status",
    )
    .eq("id", ticketCheckoutId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    logger.error(`Failed fetching checkout line: ${checkoutError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!rawCheckout) {
    return {
      status: 404,
      message: "This checkout item is no longer editable.",
    };
  }

  const checkout = rawCheckout as CheckoutRow;
  const oldQuantity = checkout.quantity;
  const oldDiscountedUnits = checkout.discounted_units;
  const delta = newQuantity - oldQuantity;

  if (delta === 0) {
    return { status: 200 };
  }

  // Resolve the promo row once up front (if any) so every later step
  // references the same promoCodeRowId — no re-querying by text code in
  // rollback branches, which is what caused a real bug in an earlier draft
  // of this action (passing the text code where a DB id was expected).
  let promoCodeRowId: string | null = null;
  let discountPercentage = 0;
  let maxUses: number | null = null;
  let timesUsed = 0;

  if (checkout.promo_code) {
    const { data: promoCode, error: promoCodeError } = await supabase
      .from("promo_code")
      .select("id, times_used, max_uses, discount_percentage")
      .eq("promo_code", checkout.promo_code)
      .maybeSingle();

    if (promoCodeError || !promoCode) {
      return { status: 500, message: "Something went wrong!" };
    }

    promoCodeRowId = promoCode.id;
    discountPercentage = promoCode.discount_percentage;
    maxUses = promoCode.max_uses;
    timesUsed = promoCode.times_used;
  }

  let newDiscountedUnits = oldDiscountedUnits;
  if (promoCodeRowId) {
    if (delta > 0) {
      const poolCapacity =
        maxUses === null ? delta : Math.max(0, maxUses - timesUsed);
      newDiscountedUnits = oldDiscountedUnits + Math.min(delta, poolCapacity);
    } else {
      newDiscountedUnits = Math.min(newQuantity, oldDiscountedUnits);
    }
  }
  const promoUnitsDelta = newDiscountedUnits - oldDiscountedUnits;

  // --- Reserve/release inventory ---
  if (delta > 0) {
    const reservation = await reserveTicketQuantity(
      checkout.ticket_type_id,
      delta,
    );

    if (reservation.status !== 200) {
      return { status: reservation.status, message: reservation.message };
    }
  } else {
    await releaseTicketQuantity(checkout.ticket_type_id, -delta);
  }

  const rollbackInventory = async () => {
    if (delta > 0) {
      await releaseTicketQuantity(checkout.ticket_type_id, delta);
    } else {
      await reserveTicketQuantity(checkout.ticket_type_id, -delta);
    }
  };

  // --- Adjust promo usage (does not touch the promo_code_usage row) ---
  if (promoCodeRowId && promoUnitsDelta !== 0) {
    const adjustment = await adjustPromoUsageUnits(
      promoCodeRowId,
      promoUnitsDelta,
    );

    if (adjustment.status !== 200) {
      await rollbackInventory();
      return { status: adjustment.status, message: adjustment.message };
    }
  }

  const rollbackPromo = async () => {
    if (promoCodeRowId && promoUnitsDelta !== 0) {
      await adjustPromoUsageUnits(promoCodeRowId, -promoUnitsDelta);
    }
  };

  // --- Write the row, CAS-guarded on the quantity we read ---
  const { discount, amount } = computeLineAmount(
    newQuantity,
    checkout.unit_price,
    discountPercentage,
    newDiscountedUnits,
  );

  const { data: updated, error: updateError } = await supabase
    .from("ticket_checkout")
    .update({
      quantity: newQuantity,
      discount,
      discounted_units: newDiscountedUnits,
      total_price: amount,
      updated_at: new Date(),
    })
    .eq("id", ticketCheckoutId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .eq("quantity", oldQuantity)
    .select("id");

  if (updateError) {
    logger.error(`Failed updating checkout quantity: ${updateError.message}`);
    await rollbackPromo();
    await rollbackInventory();
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updated || updated.length === 0) {
    // Lost race: the row changed (quantity edited elsewhere, or
    // cancelled/expired) between our read and this write. Undo both the
    // inventory delta and the promo delta applied above.
    await rollbackPromo();
    await rollbackInventory();

    return {
      status: 409,
      message: "This checkout was just updated — please try again.",
    };
  }

  return { status: 200, quantity: newQuantity, discount, amount };
}
