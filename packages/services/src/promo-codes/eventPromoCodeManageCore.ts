import { promoExpiryForStorage } from "@abonten/core/promoExpiry";
import {
  FREE_TICKET_TYPE,
  freeEventPromoCodesMessage,
} from "@abonten/core/ticketTiers";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";

// Post-auth bodies of getEventPromoCodes / updatePromoCode / deletePromoCode,
// lifted so the mobile organizer promo-code routes run the exact same logic
// as the web Server Actions — no fork. `promo_code` has no organizer_id of
// its own, so ownership is always proved by joining to its `event`.
// Deliberately NOT a "use server" file.

export type EventPromoCode = {
  id: string;
  promoCode: string;
  discountPercentage: number | null;
  maxUses: number | null;
  timesUsed: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type EventPromoCodesCoreResult =
  | { status: 403 | 500; message: string; data: EventPromoCode[] }
  | {
      status: 200;
      message: string;
      data: EventPromoCode[];
      /** A free event takes no new codes (its old ones stay for history). */
      freeEvent: boolean;
    };

export async function fetchEventPromoCodes(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<EventPromoCodesCoreResult> {
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, ticket_type(type)")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    return {
      status: 500,
      message: userFacingError("Promo code", eventError),
      data: [],
    };
  }

  if (!event) {
    return {
      status: 403,
      message: tr("notAuthorizedToViewThisEvent2"),
      data: [],
    };
  }

  const { data: promoCodes, error: promoCodesError } = await supabase
    .from("promo_code")
    .select(
      "id, promo_code, discount_percentage, max_uses, times_used, expires_at, is_active, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (promoCodesError) {
    return {
      status: 500,
      message: userFacingError("Promo code", promoCodesError),
      data: [],
    };
  }

  const data: EventPromoCode[] = (promoCodes ?? []).map((p) => ({
    id: p.id,
    promoCode: p.promo_code,
    discountPercentage: p.discount_percentage,
    maxUses: p.max_uses,
    timesUsed: p.times_used,
    expiresAt: p.expires_at,
    isActive: p.is_active,
    createdAt: p.created_at,
  })) as unknown as EventPromoCode[];

  const freeEvent = (event.ticket_type ?? []).some(
    (t) => t.type === FREE_TICKET_TYPE,
  );

  return { status: 200, message: "OK", data, freeEvent };
}

export type CreatePromoCodeCoreInput = {
  eventId: string;
  promoCode: string;
  discountPercentage: number;
  /** null = no limit. */
  maxUses: number | null;
  expiresAt: Date | string;
};

export type CreatePromoCodeCoreResult = {
  status: 200 | 400 | 403 | 409 | 500;
  message: string;
};

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const PROMO_CODE_MAX_LENGTH = 40;

// A new code on an event that already exists (event creation adds its own
// through create_event). The caller's own client writes it: the
// promo_code_organizer_insert policy and the restricted-account and
// free-event triggers all apply, and the ownership check below is the same
// one the edit and delete paths make.
export async function createPromoCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreatePromoCodeCoreInput,
): Promise<CreatePromoCodeCoreResult> {
  const code = input.promoCode.trim().toUpperCase();
  const discount = input.discountPercentage;
  const maxUses = input.maxUses;
  if (
    code.length === 0 ||
    code.length > PROMO_CODE_MAX_LENGTH ||
    !Number.isInteger(discount) ||
    discount < 1 ||
    discount > 100 ||
    (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))
  ) {
    return { status: 400, message: tr("checkThePromoCodeDetails") };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, timezone, ticket_type(type)")
    .eq("id", input.eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    return { status: 500, message: userFacingError("Promo code", eventError) };
  }

  if (!event) {
    return { status: 403, message: tr("notAuthorizedToAddPromoCodes") };
  }

  if ((event.ticket_type ?? []).some((t) => t.type === FREE_TICKET_TYPE)) {
    return { status: 400, message: freeEventPromoCodesMessage(coreT()) };
  }

  // The day the organizer picked, in the event's own calendar.
  const expiresAt = promoExpiryForStorage(
    input.expiresAt,
    (event as { timezone?: string }).timezone ?? "UTC",
  );
  if (!expiresAt) {
    return { status: 400, message: tr("checkThePromoCodeDetails") };
  }

  const { error: insertError } = await supabase.from("promo_code").insert({
    event_id: input.eventId,
    promo_code: code,
    discount_percentage: discount,
    max_uses: maxUses,
    expires_at: expiresAt,
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return { status: 409, message: tr("thisEventAlreadyHasThatPromoCode") };
    }
    if (insertError.code === CHECK_VIOLATION) {
      return {
        status: 400,
        message: userFacingError("Promo code", insertError),
      };
    }
    return {
      status: 500,
      message: userFacingError("Failed to add promo code", insertError),
    };
  }

  return { status: 200, message: tr("promoCodeAdded") };
}

export type UpdatePromoCodeCoreInput = {
  promoCodeId: string;
  discountPercentage: number;
  maxUses: number | null;
  expiresAt: Date | string;
  isActive: boolean;
};

export type UpdatePromoCodeCoreResult = {
  status: 200 | 400 | 403 | 404 | 500;
  message: string;
};

// Deliberately does not touch the promo_code text itself or event_id — keeps
// this scoped to the terms of an existing code (discount, cap, expiry,
// active flag), not renaming/re-scoping it.
export async function updatePromoCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdatePromoCodeCoreInput,
): Promise<UpdatePromoCodeCoreResult> {
  const { data: promoCode, error: fetchError } = await supabase
    .from("promo_code")
    .select("id, event_id")
    .eq("id", input.promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: userFacingError("Promo code", fetchError) };
  }

  if (!promoCode || promoCode.event_id === null) {
    return { status: 404, message: tr("promoCodeNotFound") };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, timezone, ticket_type(type)")
    .eq("id", promoCode.event_id)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    return { status: 500, message: userFacingError("Promo code", eventError) };
  }

  if (!event) {
    return {
      status: 403,
      message: tr("notAuthorizedToEditThisPromo"),
    };
  }

  // A code retired when the event went free can be edited but not switched
  // back on while the event is still free (the database refuses that too).
  const isFree = (event.ticket_type ?? []).some(
    (t) => t.type === FREE_TICKET_TYPE,
  );
  if (input.isActive && isFree) {
    return { status: 400, message: freeEventPromoCodesMessage(coreT()) };
  }

  const { error: updateError } = await supabase
    .from("promo_code")
    .update({
      discount_percentage: input.discountPercentage,
      max_uses: input.maxUses,
      // The day the organizer picked, in the event's own calendar.
      expires_at: promoExpiryForStorage(
        input.expiresAt,
        (event as { timezone?: string }).timezone ?? "UTC",
      ),
      is_active: input.isActive,
    })
    .eq("id", input.promoCodeId);

  if (updateError) {
    if (updateError.code === CHECK_VIOLATION) {
      return {
        status: 400,
        message: userFacingError("Promo code", updateError),
      };
    }
    return {
      status: 500,
      message: userFacingError("Failed to update promo code", updateError),
    };
  }

  return { status: 200, message: tr("promoCodeUpdatedSuccessfully") };
}

export type DeletePromoCodeCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
  deactivatedOnly?: boolean;
};

export async function deletePromoCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  promoCodeId: string,
): Promise<DeletePromoCodeCoreResult> {
  const { data: promoCode, error: fetchError } = await supabase
    .from("promo_code")
    .select("id, event_id, times_used")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: userFacingError("Promo code", fetchError) };
  }

  if (!promoCode || promoCode.event_id === null) {
    return { status: 404, message: tr("promoCodeNotFound") };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", promoCode.event_id)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    return { status: 500, message: userFacingError("Promo code", eventError) };
  }

  if (!event) {
    return {
      status: 403,
      message: tr("notAuthorizedToDeleteThisPromo"),
    };
  }

  // promo_code_usage rows reference this code with ON DELETE CASCADE, so a
  // hard delete on a code that's already been redeemed would silently wipe
  // real usage/discount history. Deactivate instead once it's been used at
  // least once — the code stops working at checkout (getPromoCode.ts checks
  // is_active) but the redemption history that already happened stays
  // intact. Only a never-used code is actually removed.
  if ((promoCode.times_used ?? 0) > 0) {
    const { error: deactivateError } = await supabase
      .from("promo_code")
      .update({ is_active: false })
      .eq("id", promoCodeId);

    if (deactivateError) {
      return {
        status: 500,
        message: userFacingError(
          "Failed to deactivate promo code",
          deactivateError,
        ),
      };
    }

    return {
      status: 200,
      message: tr("thisPromoCodeHasAlreadyBeen"),
      deactivatedOnly: true,
    };
  }

  const { error: deleteError } = await supabase
    .from("promo_code")
    .delete()
    .eq("id", promoCodeId);

  if (deleteError) {
    return {
      status: 500,
      message: userFacingError("Failed to delete promo code", deleteError),
    };
  }

  return {
    status: 200,
    message: tr("promoCodeDeletedSuccessfully"),
    deactivatedOnly: false,
  };
}
