// Which OTP provider serves a phone number: the market of the number's
// country, via market.otp_provider. A number from a country without a
// market, or a market whose provider is not configured, cannot sign in by
// phone — the caller gets a clear message instead of a code that never
// arrives.

import { findCountry } from "@abonten/core/geo/countries";
import { logger } from "@abonten/core/logger";
import type { OtpProviderCode } from "@abonten/core/market/types";
import { tr } from "../../i18n/requestLocale";
import { getDefaultMarket, marketForPhone } from "../../markets/marketConfig";
import { getSupabaseServiceClient } from "../../supabase/serviceClient";
import type { PhoneOtpPurpose } from "../phoneOtpStore";
import { appReviewOtpProvider, isAppReviewPhone } from "./appReviewOtpProvider";
import { hubtelOtpProvider } from "./hubtelOtpProvider";
import { twilioVerifyProvider } from "./twilioVerifyProvider";
import type { OtpProvider } from "./types";

const PROVIDERS: Record<OtpProviderCode, OtpProvider> = {
  hubtel: hubtelOtpProvider,
  twilio: twilioVerifyProvider,
};

/** The provider that issued a pending code (market providers + App Review). */
export function getOtpProvider(code: string): OtpProvider | null {
  if (code === appReviewOtpProvider.code) return appReviewOtpProvider;
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

export async function routeOtpForPhone(
  phoneE164: string,
  options: { purpose?: PhoneOtpPurpose } = {},
): Promise<OtpRoute> {
  const { market, numberCountry: countryCode } =
    await marketForPhone(phoneE164);
  if (!countryCode) {
    return {
      ok: false,
      reason: "unknown_country",
      message: tr("enterAValidPhoneNumber"),
    };
  }
  const countryName =
    findCountry(market?.countryCode ?? countryCode)?.name ?? countryCode;
  // A market still being set up (draft, preparing) sends no codes: its
  // provider may be configured for testing, and every send costs money.
  if (!market || market.status === "draft" || market.status === "preparing") {
    return {
      ok: false,
      reason: "no_market",
      message: tr("phoneSignInIsnTAvailable", {
        countryName: countryName,
      }),
    };
  }
  // App store reviewers' demo number: a fixed code, no text message, so
  // neither the market's provider nor the SMS ceiling applies. Sign-in only.
  if (options.purpose === "sign-in" && isAppReviewPhone(phoneE164)) {
    return {
      ok: true,
      provider: appReviewOtpProvider,
      countryCode: market.countryCode,
    };
  }
  const provider = market.otpProvider ? PROVIDERS[market.otpProvider] : null;
  if (!provider) {
    return {
      ok: false,
      reason: "no_provider",
      message: tr("phoneSignInIsnTAvailable", {
        countryName: countryName,
      }),
    };
  }
  if (!provider.isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: tr("textMessageCodesArenTAvailable"),
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
      message: tr("weReSendingALotOf"),
    };
  }
  return { ok: true, provider, countryCode: market.countryCode };
}

/** Hourly code ceilings per country (see routeOtpForPhone). */
export const DEFAULT_MARKET_SENDS_PER_HOUR = 5000;
export const OTHER_MARKET_SENDS_PER_HOUR = 300;
