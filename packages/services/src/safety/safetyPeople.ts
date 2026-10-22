import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getMarketOrDefault, marketForPhone } from "../markets/marketConfig";

// Who a Safety session is about, as their contacts are told: the name on
// their profile, their photo, the phone number they verified (so the alert
// is recognisably theirs and contacts can call back), their language and
// their clock.

export type SafetyPerson = {
  id: string;
  /** The profile name, else the username: what contacts are told. */
  name: string | null;
  /** True when the profile has a real name (Safety's setup asks for one). */
  hasProfileName: boolean;
  avatarUrl: string | null;
  /** E.164, only when verified. */
  phoneE164: string | null;
  locale: string;
  countryCode: string;
  timezone: string;
};

function e164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}

export async function loadSafetyPerson(
  svc: ServiceRoleClient,
  userId: string,
): Promise<SafetyPerson> {
  const [{ data: info, error }, auth] = await Promise.all([
    svc
      .from("user_info")
      .select(
        "full_name, username, avatar_public_id, avatar_version, locale, country_code",
      )
      .eq("id", userId)
      .maybeSingle(),
    svc.auth.admin.getUserById(userId),
  ]);
  if (error) logger.error(`loadSafetyPerson(${userId}): ${error.message}`);
  if (auth.error) {
    logger.error(
      `loadSafetyPerson(${userId}): auth lookup ${auth.error.message}`,
    );
  }
  const user = auth.data?.user ?? null;
  const market = await getMarketOrDefault(info?.country_code ?? null);
  const fullName = info?.full_name?.trim() || null;
  return {
    id: userId,
    name: fullName ?? (info?.username?.trim() || null),
    hasProfileName: fullName !== null,
    avatarUrl: info
      ? buildAvatarUrl(info.avatar_public_id, info.avatar_version, {
          width: 80,
          height: 80,
        })
      : null,
    phoneE164: user?.phone_confirmed_at ? e164(user.phone) : null,
    locale: info?.locale ?? "en",
    countryCode: market.countryCode,
    timezone: market.defaultTimeZone,
  };
}

/**
 * Whether Abonten can text this number: it is in a market whose text rail
 * is Hubtel (Ghana today). Other numbers are reached by push, email and the
 * person's own phone.
 */
export async function canTextNumber(phoneE164: string): Promise<boolean> {
  try {
    const { market } = await marketForPhone(phoneE164);
    return market?.otpProvider === "hubtel";
  } catch (error) {
    logger.error(
      `canTextNumber: market lookup failed (${error instanceof Error ? error.message : String(error)})`,
    );
    return false;
  }
}
