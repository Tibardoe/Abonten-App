import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../security/signing";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Recommendation digest email: the person's own opt-in and every way to take
// it back. LEGAL GATE: legal item G1 (Act 843 consent for promotional
// email) is Open, so the programme switch that lets anyone opt in ships off
// (discovery_program_setting.recommendations_email_enabled) and must stay off
// until G1 is Decided.
//
// One switch covers the three email columns (similar picks, organizers you
// follow, places you follow): the digest is one email. Every change is
// written to notification_consent_event with where it came from, which is
// the consent record Act 843 asks for. Turning it off never needs the
// programme to be on, a sign-in (the signed link) or a mail client (the
// one-click header).

const PURPOSE = "recommendation-email-unsubscribe:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConsentSource =
  | "settings_web"
  | "settings_app"
  | "email_link"
  | "email_one_click";

type Envelope<T> = { status: number; message?: string; data?: T };

export function recommendationEmailUnsubscribeToken(userId: string): string {
  return hmacBase64Url(deriveSigningKey(PURPOSE), userId);
}

/** The footer link (asks first) and the RFC 8058 one-click endpoint. */
export function recommendationEmailUnsubscribeLinks(
  userId: string,
  baseUrl: string,
) {
  const query = `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(
    recommendationEmailUnsubscribeToken(userId),
  )}`;
  return {
    page: `${baseUrl}/unsubscribe/recommendations?${query}`,
    oneClick: `${baseUrl}/api/notifications/unsubscribe?topic=recommendations&${query}`,
  };
}

export function isRecommendationEmailLinkValid(
  userId: unknown,
  token: unknown,
): boolean {
  if (typeof userId !== "string" || typeof token !== "string") return false;
  if (!UUID.test(userId) || !token) return false;
  try {
    return signaturesMatch(token, recommendationEmailUnsubscribeToken(userId));
  } catch {
    return false;
  }
}

/** Writes the three email switches and the consent record. */
export async function writeRecommendationEmailConsent(
  service: ServiceRoleClient,
  userId: string,
  enabled: boolean,
  source: ConsentSource,
): Promise<{ ok: boolean }> {
  const { data: current } = await service
    .from("notification_preference")
    .select(
      "recommendations_email, organizer_alerts_email, place_updates_email",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const wasOn = !!(
    current?.recommendations_email ||
    current?.organizer_alerts_email ||
    current?.place_updates_email
  );

  const { error } = await service.from("notification_preference").upsert(
    {
      user_id: userId,
      recommendations_email: enabled,
      organizer_alerts_email: enabled,
      place_updates_email: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    logger.error(`recommendation email preference failed: ${error.message}`);
    return { ok: false };
  }

  // Only real changes are consent events; saving the same answer is not.
  if (wasOn !== enabled) {
    const { error: logError } = await service
      .from("notification_consent_event")
      .insert({
        user_id: userId,
        channel: "email",
        topic: "recommendations",
        action: enabled ? "granted" : "withdrawn",
        source,
      });
    if (logError) {
      logger.error(`notification_consent_event failed: ${logError.message}`);
    }
  }
  return { ok: true };
}

/** From the email: no sign-in, the token proves we sent the link. */
export async function setRecommendationEmailsByTokenCore(input: {
  userId: unknown;
  token: unknown;
  source: "email_link" | "email_one_click";
}): Promise<Envelope<{ recommendationEmails: boolean }>> {
  if (!isRecommendationEmailLinkValid(input.userId, input.token)) {
    return {
      status: 400,
      message:
        "This link isn't valid. Open the link from your latest email, or change it in Settings › Notifications.",
    };
  }
  const res = await writeRecommendationEmailConsent(
    getSupabaseServiceClient(),
    input.userId as string,
    false,
    input.source,
  );
  if (!res.ok) {
    return { status: 500, message: "Couldn't save your email settings." };
  }
  return {
    status: 200,
    message: "You won't get emails about picks and alerts.",
    data: { recommendationEmails: false },
  };
}
