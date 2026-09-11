import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import {
  type ReferralTouch,
  pickReferralTouch,
} from "@abonten/core/rewards/referralAttribution";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import type { Database } from "@abonten/types/database.types";
import type { ReferralHint, ReferralLink } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "../security/rateLimit";
import { deriveSigningKey, hmacBase64Url } from "../security/signing";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { rewardsKillSwitchOn } from "./rewardsProgramQuery";

// Event-referral capture (Abonten Rewards Phase 4). Shared by the web Server
// Actions / proxy and the /api/mobile routes. Every function takes an
// identity the transport already resolved; a code or touch the client sends
// is only a hint -- the database functions (referral_record_touch,
// stamp_checkout_referral) re-check everything.

export type ReferralPlatform = "web" | "android" | "ios";

type Settings = {
  referral_capture_enabled: boolean;
  referral_attribution_window_days: number;
};

// The deploy-level kill switch (REWARDS_KILL_SWITCH) stops capture too.
async function captureSettings(): Promise<Settings | null> {
  if (rewardsKillSwitchOn()) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("reward_program_setting")
    .select("referral_capture_enabled, referral_attribution_window_days")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`Failed reading referral settings: ${error.message}`);
    return null;
  }
  return data as Settings | null;
}

/**
 * The caller's code for share links, created the first time a signed-in user
 * can share while capture is on. Null (no ?ref on links) while it's off.
 */
export async function getReferralLinkCore(userId: string): Promise<{
  status: 200 | 500;
  data?: ReferralLink;
  message?: string;
}> {
  const settings = await captureSettings();
  const attributionWindowDays = settings?.referral_attribution_window_days ?? 7;
  if (!settings?.referral_capture_enabled) {
    return {
      status: 200,
      data: { captureEnabled: false, code: null, attributionWindowDays },
    };
  }
  const { data, error } = await getSupabaseServiceClient().rpc(
    "referral_ensure_code",
    { p_user_id: userId },
  );
  if (error || typeof data !== "string") {
    logger.error(
      `referral_ensure_code failed for ${userId}: ${error?.message}`,
    );
    return { status: 500, message: "Couldn't load your referral link." };
  }
  return {
    status: 200,
    data: { captureEnabled: true, code: data, attributionWindowDays },
  };
}

function hashFor(purpose: string, value: string | null | undefined) {
  if (!value) return null;
  return hmacBase64Url(deriveSigningKey(purpose), value).slice(0, 32);
}

/**
 * Logs a visit through a referral link (fire-and-forget from the page).
 * Rate-limited per IP; the IP and user agent are stored only as salted
 * hashes. Returns the database's verdict for logging/tests.
 */
export async function recordReferralTouchCore(input: {
  code: string;
  eventId?: string | null;
  eventSlug?: string | null;
  placeId?: string | null;
  placeSlug?: string | null;
  visitorUserId?: string | null;
  installId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  platform: ReferralPlatform;
  source?: "link" | "qr" | "install_referrer";
}): Promise<{ status: 202 | 400 | 429; result?: string }> {
  const code = normalizeReferralCode(input.code);
  if (!code) return { status: 400 };
  if (rewardsKillSwitchOn()) return { status: 202, result: "capture_off" };

  const limiterKey = input.ip ?? input.visitorUserId ?? input.installId;
  if (limiterKey) {
    const allowed = await checkRateLimit(
      `referral-touch:${limiterKey}`,
      30,
      60,
    );
    if (!allowed) return { status: 429 };
  }

  const service = getSupabaseServiceClient();

  let eventId = input.eventId ?? null;
  if (!eventId && input.eventSlug) {
    eventId = await eventIdForSlug(service, input.eventSlug);
  }
  let placeId = input.placeId ?? null;
  if (!placeId && input.placeSlug) {
    const { data } = await service
      .from("place")
      .select("id")
      .eq("slug", input.placeSlug)
      .maybeSingle();
    placeId = data?.id ?? null;
  }

  const installId =
    input.installId &&
    input.installId.length >= 8 &&
    input.installId.length <= 100
      ? input.installId
      : null;

  const { data, error } = await service.rpc("referral_record_touch", {
    p_code: code,
    p_event_id: eventId,
    p_place_id: placeId,
    p_visitor_user_id: input.visitorUserId ?? null,
    p_install_id: installId,
    p_ip_hash: hashFor("referral-ip:v1", input.ip),
    p_ua_hash: hashFor("referral-ua:v1", input.userAgent),
    p_platform: input.platform,
    p_source: input.source ?? "link",
  } as unknown as Database["public"]["Functions"]["referral_record_touch"]["Args"]);

  if (error) {
    logger.error(`referral_record_touch failed: ${error.message}`);
  }
  return { status: 202, result: (data as string | null) ?? undefined };
}

// Event links carry the event code as a slug (see @abonten/core/shareUrl).
async function eventIdForSlug(
  service: SupabaseClient<Database>,
  slug: string,
): Promise<string | null> {
  const { data } = await service
    .from("event")
    .select("id")
    .ilike("event_code", slug.replace(/[%_]/g, ""))
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * After a checkout is opened: pick the winning referral touch for this event
 * (the client's hints + the signed-in buyer's stored attribution, last touch
 * wins) and stamp it. Best-effort -- a failure here never blocks the
 * purchase, it just goes unattributed.
 */
export async function stampCheckoutReferralCore(input: {
  userId: string;
  checkoutSessionId: string;
  event: { id: string; eventCode: string | null };
  hints?: ReferralHint[] | null;
}): Promise<string> {
  try {
    const settings = await captureSettings();
    if (!settings?.referral_capture_enabled) return "capture_off";

    const service = getSupabaseServiceClient();
    const slug = input.event.eventCode
      ? generateSlug(input.event.eventCode)
      : null;

    const candidates: ReferralTouch[] = [];
    for (const hint of input.hints ?? []) {
      const code = normalizeReferralCode(hint.code);
      const forThisEvent =
        hint.eventId === input.event.id ||
        (!!slug &&
          !!hint.eventSlug &&
          hint.eventSlug.toLowerCase() === slug.toLowerCase());
      if (code && forThisEvent && typeof hint.touchedAt === "string") {
        candidates.push({
          code,
          touchedAt: hint.touchedAt,
          source: hint.source ?? "link",
        });
      }
    }

    const { data: stored } = await service
      .from("referral_attribution")
      .select("code, touched_at, source")
      .eq("user_id", input.userId)
      .eq("event_id", input.event.id)
      .maybeSingle();
    if (stored) {
      candidates.push({
        code: stored.code,
        touchedAt: stored.touched_at,
        source: (stored.source as ReferralTouch["source"]) ?? "link",
      });
    }

    const winner = pickReferralTouch(candidates, {
      now: Date.now(),
      windowDays: settings.referral_attribution_window_days,
    });
    if (!winner) return "no_touch";

    const { data, error } = await service.rpc("stamp_checkout_referral", {
      p_checkout_session_id: input.checkoutSessionId,
      p_user_id: input.userId,
      p_code: winner.code,
      p_touched_at: winner.touchedAt,
      p_source: winner.source,
    });
    if (error) {
      logger.error(`stamp_checkout_referral failed: ${error.message}`);
      return "error";
    }
    return (data as string) ?? "error";
  } catch (error) {
    logger.error(`stampCheckoutReferralCore failed: ${error}`);
    return "error";
  }
}

/**
 * Records a share-button press on an event (analytics only -- shares are
 * never rewarded). Runs as the caller: event_share's own RLS lets a user
 * insert only their own rows.
 */
export async function recordEventShareCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    eventId: string;
    channel?: string | null;
    referralCode?: string | null;
  },
): Promise<{ status: 200 | 400 | 429 | 500 }> {
  if (!input.eventId) return { status: 400 };
  const allowed = await checkRateLimit(`event-share:${userId}`, 60, 3600);
  if (!allowed) return { status: 429 };

  const { error } = await supabase.from("event_share").insert({
    user_id: userId,
    event_id: input.eventId,
    channel: (input.channel ?? "native").slice(0, 32),
    referral_code: normalizeReferralCode(input.referralCode),
  });
  if (error) {
    logger.error(`Failed recording event share: ${error.message}`);
    return { status: 500 };
  }
  return { status: 200 };
}

// One write per (install, user) per hour per server instance at most; the
// database throttles again across instances.
const recentInstalls = new Map<string, number>();

/** Notes that a user was seen on an app install / browser (fraud signal). */
export async function recordDeviceInstallCore(
  installId: string | null | undefined,
  userId: string,
  platform: ReferralPlatform,
): Promise<void> {
  if (!installId || installId.length < 8 || installId.length > 100) return;
  const key = `${installId}:${userId}`;
  const last = recentInstalls.get(key);
  if (last && Date.now() - last < 3_600_000) return;
  recentInstalls.set(key, Date.now());
  if (recentInstalls.size > 5000) recentInstalls.clear();

  const { error } = await getSupabaseServiceClient().rpc(
    "record_device_install",
    {
      p_install_id: installId,
      p_user_id: userId,
      p_platform: platform,
    },
  );
  if (error) {
    logger.error(`record_device_install failed: ${error.message}`);
  }
}
