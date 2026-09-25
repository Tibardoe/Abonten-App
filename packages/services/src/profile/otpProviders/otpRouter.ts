// Which OTP provider serves a phone number: the market of the number's
// country, via market.otp_provider. A number from a country without a
// market, or a market whose provider is not configured, cannot sign in by
// phone — the caller gets a clear message instead of a code that never
// arrives.

import { findCountry } from "@abonten/core/geo/countries";
import { logger } from "@abonten/core/logger";
import type { OtpProviderCode } from "@abonten/core/market/types";
import {
  countryForDialCode,
  dialCodeFor,
  phoneCountry,
} from "@abonten/core/phone/phone";
import { getDefaultMarket, getMarket } from "../../markets/marketConfig";
import { getSupabaseServiceClient } from "../../supabase/serviceClient";
import { hubtelOtpProvider } from "./hubtelOtpProvider";
import { twilioVerifyProvider } from "./twilioVerifyProvider";
import type { OtpProvider } from "./types";

const PROVIDERS: Record<OtpProviderCode, OtpProvider> = {
  hubtel: hubtelOtpProvider,
  twilio: twilioVerifyProvider,
};

export function getOtpProvider(code: string): OtpProvider | null {
  return PROVIDERS[code as OtpProviderCode] ?? null;
}

export type OtpRoute =
  | { ok: true; provider: OtpProvider; countryCode: string }
  | {
      ok: false;
      message: string;
      reason:
        | "unknown_country"
        | "no_market"
        | "no_provider"
        | "not_configured"
        | "busy";
    };

export async function routeOtpForPhone(phoneE164: string): Promise<OtpRoute> {
  const countryCode = phoneCountry(phoneE164);
  if (!countryCode) {
    return {
      ok: false,
      reason: "unknown_country",
      message: "Enter a valid phone number.",
    };
  }
  // Numbers in a shared calling code belong to the code's main market when
  // their own territory has none: +44 7911 … is Guernsey to libphonenumber,
  // +1 876 … Jamaica, but a UK or US market serves them.
  let market = await getMarket(countryCode);
  if (!market) {
    const dial = dialCodeFor(countryCode);
    const main = dial ? countryForDialCode(dial) : null;
    if (main && main !== countryCode) market = await getMarket(main);
  }
  const countryName =
    findCountry(market?.countryCode ?? countryCode)?.name ?? countryCode;
  // A market still being set up (draft, preparing) sends no codes: its
  // provider may be configured for testing, and every send costs money.
  if (!market || market.status === "draft" || market.status === "preparing") {
    return {
      ok: false,
      reason: "no_market",
      message: `Phone sign-in isn't available for ${countryName} numbers yet. Sign in with Google or email instead.`,
    };
  }
  const provider = market.otpProvider ? PROVIDERS[market.otpProvider] : null;
  if (!provider) {
    return {
      ok: false,
      reason: "no_provider",
      message: `Phone sign-in isn't available for ${countryName} numbers yet. Sign in with Google or email instead.`,
    };
  }
  if (!provider.isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Text-message codes aren't available right now. Sign in with Google or email instead.",
    };
  }
  // Circuit breaker against SMS pumping (bots requesting codes to premium
  // number ranges from many addresses, which per-number and per-address
  // limits don't stop): an hourly ceiling per country, far above real
  // sign-in traffic. Tripping it is logged as an error so it pages someone.
  const isDefault =
    (await getDefaultMarket()).countryCode === market.countryCode;
  const ceiling = isDefault
    ? DEFAULT_MARKET_SENDS_PER_HOUR
    : OTHER_MARKET_SENDS_PER_HOUR;
  const { count, error } = await getSupabaseServiceClient()
    .from("phone_otp_send_log")
    .select("id", { count: "exact", head: true })
    .like("phone_e164", `${market.dialCode}%`)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (!error && (count ?? 0) >= ceiling) {
    logger.error(
      `otpRouter: hourly send ceiling reached for ${market.countryCode} (${count}/${ceiling}); refusing codes`,
      {
        security: {
          event: "otp_country_ceiling",
          countryCode: market.countryCode,
          count,
          ceiling,
        },
      },
    );
    return {
      ok: false,
      reason: "busy",
      message:
        "We're sending a lot of codes right now. Please try again shortly, or sign in with Google or email.",
    };
  }
  return { ok: true, provider, countryCode: market.countryCode };
}

/** Hourly code ceilings per country (see routeOtpForPhone). */
export const DEFAULT_MARKET_SENDS_PER_HOUR = 5000;
export const OTHER_MARKET_SENDS_PER_HOUR = 300;
