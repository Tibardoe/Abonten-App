// Which OTP provider serves a phone number: the market of the number's
// country, via market.otp_provider. A number from a country without a
// market, or a market whose provider is not configured, cannot sign in by
// phone — the caller gets a clear message instead of a code that never
// arrives.

import { findCountry } from "@abonten/core/geo/countries";
import type { OtpProviderCode } from "@abonten/core/market/types";
import { phoneCountry } from "@abonten/core/phone/phone";
import { getMarket } from "../../markets/marketConfig";
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
        | "not_configured";
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
  const market = await getMarket(countryCode);
  const countryName = findCountry(countryCode)?.name ?? countryCode;
  if (!market || market.status === "draft") {
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
  return { ok: true, provider, countryCode };
}
