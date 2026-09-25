import { logger } from "@abonten/core/logger";
import {
  PHONE_ERROR_MESSAGE,
  parsePhoneWithDialCode,
} from "@abonten/core/phone/phone";
import type { Database } from "@abonten/types/database.types";
import {
  type AddPaymentMethodInput,
  addPaymentMethodSchema,
} from "@abonten/validation/paymentMethodSchema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultMarket, getMarketOrDefault } from "../markets/marketConfig";

// Post-auth bodies of the four payment-method Server Actions, lifted so the
// `/api/mobile/payment-methods/*` routes run the exact same logic. Each
// takes an already-authenticated Supabase client + the resolved userId.
// Deliberately NOT a "use server" file (see ticketInventory.ts).

export type MomoPaymentMethodDetails = {
  networkCode: string;
  networkName: string;
  phone: string;
  label?: string;
};

export type CardPaymentMethodDetails = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  authorizationCode: string;
  bank?: string | null;
  /** The provider account that issued the token (absent on cards saved before 2026-09-25). */
  provider?: string;
  countryCode?: string;
  label?: string;
};

export type PaymentMethodRow = {
  id: string;
  method_type: "momo" | "card";
  details: MomoPaymentMethodDetails | CardPaymentMethodDetails;
  is_default: boolean;
  created_at: string;
};

export type ListPaymentMethodsResult =
  | { status: 500; message: string }
  | { status: 200; data: PaymentMethodRow[] };

export async function listPaymentMethodsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ListPaymentMethodsResult> {
  const { data, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details, is_default, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    logger.error(`Failed fetching payment methods: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as unknown as PaymentMethodRow[] };
}

// Two saved methods are the same instrument when these agree. Brand case and
// stray whitespace are normalised away because Paystack is not consistent
// about either; the authorization code deliberately is NOT part of the key,
// since re-verifying the same card is exactly what produces a new one. The
// issuing account IS part of it: the same card tokenised by Paystack Ghana
// and by Paystack Nigeria is two usable tokens. Cards saved before tokens
// were bound came from the default market's account.
function cardKey(
  details: CardPaymentMethodDetails,
  defaultCountry: string,
): string {
  return [
    (details.brand ?? "").trim().toLowerCase(),
    (details.last4 ?? "").trim(),
    details.expiryMonth,
    details.expiryYear,
    details.provider ?? "paystack",
    (details.countryCode ?? defaultCountry).toUpperCase(),
  ].join("|");
}

function momoKey(details: MomoPaymentMethodDetails): string {
  return [
    (details.networkCode ?? "").trim().toUpperCase(),
    (details.phone ?? "").trim(),
  ].join("|");
}

export type AddPaymentMethodResult =
  | { status: 400 | 500; message: string }
  | { status: 200; data: PaymentMethodRow };

export async function addPaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AddPaymentMethodInput,
): Promise<AddPaymentMethodResult> {
  const parsed = addPaymentMethodSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid payment method",
    };
  }

  const { count, error: countError } = await supabase
    .from("payment_method")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if (countError) {
    logger.error(`Failed counting payment methods: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const parsedInput = parsed.data;
  const type = parsedInput.type;
  let details: MomoPaymentMethodDetails | CardPaymentMethodDetails;

  // Both branches below look for an existing active method that is the same
  // instrument before inserting. Matching happens in JS against a normalised
  // key rather than with PostgREST's `contains`, because `contains` is exact
  // JSON containment: Paystack returns the brand with inconsistent case and
  // trailing whitespace ("visa " and "Visa" are both in production), so an
  // exact match silently failed to spot the duplicate it was written to
  // catch.
  const { data: existingMethods, error: existingError } = await supabase
    .from("payment_method")
    .select("id, method_type, details, is_default, created_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (existingError) {
    logger.error(
      `Failed fetching existing payment methods: ${existingError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const active = (existingMethods ?? []) as unknown as PaymentMethodRow[];

  if (parsedInput.type === "momo") {
    const { type: _momo, ...momo } = parsedInput;
    // Store one canonical E.164 form, validated for the person's home
    // market (a Ghanaian wallet is a Ghanaian number, a Kenyan one Kenyan).
    // The web PhoneInput already composes E.164; the mobile wallet form
    // sends whatever was typed, so the same wallet could otherwise land as
    // "0241234567" on one row and "+233241234987" on another.
    const { data: profile } = await supabase
      .from("user_info")
      .select("country_code")
      .eq("id", userId)
      .maybeSingle();
    const market = await getMarketOrDefault(profile?.country_code ?? null);
    if (
      !market.paymentMethods.some(
        (m) => m.enabled && m.method === "mobile_money",
      )
    ) {
      return {
        status: 400,
        message: `Mobile money isn't available in ${market.name} yet.`,
      };
    }
    const normalized = parsePhoneWithDialCode(market.dialCode, momo.phone);
    if (!normalized.ok) {
      return { status: 400, message: PHONE_ERROR_MESSAGE[normalized.error] };
    }

    // The same wallet saved twice is the same instrument, whatever label the
    // second save carried. Nothing stopped that before, and a duplicated
    // wallet in the checkout list invites paying from the wrong entry.
    const duplicate = active.find(
      (row) =>
        row.method_type === "momo" &&
        momoKey(row.details as MomoPaymentMethodDetails) ===
          momoKey({ ...momo, phone: normalized.e164 }),
    );
    if (duplicate) return { status: 200, data: duplicate };

    details = { ...momo, phone: normalized.e164 };
  } else {
    const { type: _card, ...card } = parsedInput;
    // A card is added by re-running the provider's small verification charge, and a
    // second verification of the same card yields a new authorization_code.
    // Without this, every re-verification saved another identical row --
    // production held two "visa 4081" cards with the same expiry and bank.
    // Treat a matching active card as already saved and hand it back.
    const normalizedCard = { ...card, brand: card.brand.trim() };
    const defaultCountry = (await getDefaultMarket()).countryCode;

    const duplicate = active.find(
      (row) =>
        row.method_type === "card" &&
        cardKey(row.details as CardPaymentMethodDetails, defaultCountry) ===
          cardKey(normalizedCard, defaultCountry),
    );
    if (duplicate) return { status: 200, data: duplicate };

    details = normalizedCard;
  }

  const { data, error } = await supabase
    .from("payment_method")
    .insert({
      user_id: userId,
      method_type: type,
      details,
      is_default: (count ?? 0) === 0,
      status: "active",
    })
    .select("id, method_type, details, is_default, created_at")
    .single();

  if (error) {
    logger.error(`Failed saving payment method: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: data as unknown as PaymentMethodRow };
}

export type MutatePaymentMethodResult = {
  status: 200 | 404 | 500;
  message: string;
};

export async function removePaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentMethodId: string,
): Promise<MutatePaymentMethodResult> {
  const { data: method, error: fetchError } = await supabase
    .from("payment_method")
    .select("id, is_default")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    logger.error(`Failed fetching payment method: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  const { error: removeError } = await supabase
    .from("payment_method")
    .update({
      status: "removed",
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentMethodId)
    .eq("user_id", userId);

  if (removeError) {
    logger.error(`Failed removing payment method: ${removeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (method.is_default) {
    const { data: nextDefault } = await supabase
      .from("payment_method")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextDefault) {
      await supabase
        .from("payment_method")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", nextDefault.id)
        .eq("user_id", userId);
    }
  }

  return { status: 200, message: "Payment method removed" };
}

export async function setDefaultPaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentMethodId: string,
): Promise<MutatePaymentMethodResult> {
  const { data: method, error: fetchError } = await supabase
    .from("payment_method")
    .select("id")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    logger.error(`Failed fetching payment method: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  const { error: unsetError } = await supabase
    .from("payment_method")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true)
    .neq("id", paymentMethodId);

  if (unsetError) {
    logger.error(`Failed clearing previous default: ${unsetError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: setError } = await supabase
    .from("payment_method")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (setError) {
    logger.error(`Failed setting default payment method: ${setError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Default payment method updated" };
}
