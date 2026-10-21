import { logger } from "@abonten/core/logger";
import { otpMessage } from "@abonten/core/otpMessages";
import {
  parsePhoneWithDialCode,
  phoneErrorMessage,
} from "@abonten/core/phone/phone";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";
import { getMarketOrDefault } from "../markets/marketConfig";
import {
  sendPhoneOtpCore,
  verifyPendingOtp,
} from "../profile/phoneOtpSendCore";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "../profile/phoneOtpStore";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// A mobile money number is confirmed before it is saved, as a buyer's wallet
// (paymentMethodCore) or an organizer's payout account (payoutAccountCore).
// A mistyped number sent payment requests, or an organizer's earnings, to a
// stranger. The person's own verified phone is already proven and needs no
// code; any other number gets a text-message code (purpose "wallet", so a
// sign-in or phone-change code never confirms a wallet and vice versa).
// Deliberately NOT a "use server" file.

/** Where the number will be used: it decides the market rule checked. */
export type MobileMoneyNumberUse = "wallet" | "payout";

export type RequestMobileMoneyCodeInput = {
  phone: string;
  use: MobileMoneyNumberUse;
  /** A payout account's market; a wallet is always the home market's. */
  countryCode?: string | null;
};

export type RequestMobileMoneyCodeResult =
  | {
      status: 200;
      data: {
        phoneE164: string;
        /** False when the number is the person's own verified phone. */
        needsCode: boolean;
        /** Digits in the texted code (0 when no code was sent). */
        codeLength: number;
      };
    }
  | { status: 400 | 403 | 429 | 500 | 503; message: string };

function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** True when the number is the account's own phone, already verified. */
async function isOwnVerifiedPhone(
  userId: string,
  phoneE164: string,
): Promise<boolean> {
  const { data, error } =
    await getSupabaseServiceClient().auth.admin.getUserById(userId);
  if (error || !data.user) {
    logger.error(
      `mobileMoneyNumberCheck: user lookup failed: ${error?.message ?? "no user"}`,
    );
    return false;
  }
  const { phone, phone_confirmed_at } = data.user;
  return !!phone_confirmed_at && digits(phone) === digits(phoneE164);
}

export async function requestMobileMoneyNumberCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RequestMobileMoneyCodeInput,
  ipAddress: string | null,
): Promise<RequestMobileMoneyCodeResult> {
  if (typeof input?.phone !== "string" || !input.phone.trim()) {
    return { status: 400, message: tr("enterAValidPhoneNumber") };
  }
  if (input.use !== "wallet" && input.use !== "payout") {
    return { status: 400, message: tr("enterAValidPhoneNumber") };
  }
  // Each code is a paid text message.
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  // The same market the save will use: a wallet is in the person's home
  // market, a payout account in the market it names (else the home one).
  let homeCountry: string | null = null;
  if (input.use === "wallet" || !input.countryCode) {
    const { data: profile } = await supabase
      .from("user_info")
      .select("country_code")
      .eq("id", userId)
      .maybeSingle();
    homeCountry = profile?.country_code ?? null;
  }
  const market = await getMarketOrDefault(
    input.use === "payout" ? (input.countryCode ?? homeCountry) : homeCountry,
  );
  const offered =
    input.use === "wallet"
      ? market.paymentMethods.some(
          (m) => m.enabled && m.method === "mobile_money",
        )
      : market.payoutMethods.some(
          (m) => m.enabled && m.method === "mobile_money",
        );
  if (!offered) {
    return {
      status: 400,
      message:
        input.use === "wallet"
          ? tr("mobileMoneyIsnTAvailableIn2", { name: market.name })
          : tr("mobileMoneyPayoutsArenTAvailable", { name: market.name }),
    };
  }

  const parsed = parsePhoneWithDialCode(market.dialCode, input.phone);
  if (!parsed.ok) {
    return { status: 400, message: phoneErrorMessage(coreT(), parsed.error) };
  }

  if (await isOwnVerifiedPhone(userId, parsed.e164)) {
    return {
      status: 200,
      data: { phoneE164: parsed.e164, needsCode: false, codeLength: 0 },
    };
  }

  const sent = await sendPhoneOtpCore({
    dialCode: market.dialCode,
    rawPhone: input.phone,
    purpose: "wallet",
    ipAddress,
  });
  if (sent.status !== 200) {
    return { status: sent.status, message: sent.message };
  }
  return {
    status: 200,
    data: {
      phoneE164: sent.phoneE164,
      needsCode: true,
      codeLength: sent.codeLength,
    },
  };
}

export type MobileMoneyNumberConfirmation =
  | { ok: true }
  | { ok: false; status: 400 | 429; message: string };

/**
 * Called by the saves just before they write: the number is the person's own
 * verified phone, or `code` is the one texted to it. A good code is used up.
 */
export async function confirmMobileMoneyNumber(
  userId: string,
  phoneE164: string,
  code: string | null | undefined,
): Promise<MobileMoneyNumberConfirmation> {
  if (await isOwnVerifiedPhone(userId, phoneE164)) return { ok: true };

  const value = (code ?? "").trim();
  if (!value) {
    return { ok: false, status: 400, message: tr("confirmThisNumberWithA") };
  }
  if (!/^\d{4,8}$/.test(value)) {
    return {
      ok: false,
      status: 400,
      message: otpMessage(coreT(), "invalidFormat"),
    };
  }
  if (!(await getPendingOtp("wallet", phoneE164))) {
    return { ok: false, status: 400, message: otpMessage(coreT(), "expired") };
  }
  if (!(await registerVerifyAttempt("wallet", phoneE164))) {
    return {
      ok: false,
      status: 429,
      message: otpMessage(coreT(), "tooManyAttempts"),
    };
  }
  const pending = await getPendingOtp("wallet", phoneE164);
  if (!pending) {
    return { ok: false, status: 400, message: otpMessage(coreT(), "expired") };
  }
  const verified = await verifyPendingOtp(pending, value);
  if (!verified.ok) {
    return { ok: false, status: 400, message: verified.message };
  }
  await clearPendingOtp("wallet", phoneE164);
  return { ok: true };
}
