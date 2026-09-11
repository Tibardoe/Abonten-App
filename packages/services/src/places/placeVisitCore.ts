import { logger } from "@abonten/core/logger";
import { SITE_ORIGIN } from "@abonten/core/rewards/invite";
import type { Database } from "@abonten/types/database.types";
import type {
  PlaceVisitOutcome,
  PlaceVisitPanel,
  PlaceVisitResult,
} from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRewardsProgramCore } from "../rewards/rewardsProgramQuery";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Verified place visits (Abonten Rewards Phase 8). The owner shows a QR code
// that changes every 30 seconds; a visitor scans it within about 150 m of the
// place and is checked in once a day. The monthly run turns different
// verified visitors into promotion credit for the owner of a verified place.
// The code and the distance are checked in the database (place_visit_record);
// a code or location a client sends is only a claim.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message?: string;
  data?: T;
};

type StatsJson = {
  today?: number;
  this_month_visits?: number;
  this_month_visitors?: number;
  last_month_visitors?: number;
  earned_minor?: number;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const EMPTY_STATS: PlaceVisitPanel["stats"] = {
  today: 0,
  thisMonthVisits: 0,
  thisMonthVisitors: 0,
  lastMonthVisitors: 0,
  earnedMinor: 0,
};

/** The URL a place's visit QR code opens (the place page + the code). */
export function placeVisitUrl(
  slug: string,
  code: string,
  origin: string = SITE_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/places/${encodeURIComponent(slug)}?visit=${encodeURIComponent(code)}`;
}

/**
 * The owner's check-in panel: the current code (call again when it expires)
 * and the visit figures.
 */
export async function getPlaceVisitPanelCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  origin?: string,
): Promise<Envelope<PlaceVisitPanel>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (!placeId) return { status: 400, message: "Place is required." };

  const service = getSupabaseServiceClient();
  const { data: place, error } = await service
    .from("place")
    .select("id, owner_id, slug, verified")
    .eq("id", placeId)
    .maybeSingle();
  if (error) {
    logger.error(`getPlaceVisitPanelCore place read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  if (!place) return { status: 404, message: "Place not found." };
  if (place.owner_id !== userId) {
    return {
      status: 403,
      message: "Only the place's owner can show its check-in code.",
    };
  }

  const program = await getRewardsProgramCore(supabase);
  const terms = program.data.enabled ? program.data.placeVisits : null;
  if (!terms) {
    return {
      status: 200,
      data: {
        available: false,
        verified: place.verified,
        code: null,
        url: null,
        expiresAt: null,
        periodSeconds: 30,
        perVisitorMinor: 0,
        maxVisitors: 0,
        stats: EMPTY_STATS,
      },
    };
  }

  const [code, stats] = await Promise.all([
    service.rpc("place_visit_code", { p_place_id: placeId }),
    service.rpc("place_visit_stats", { p_place_id: placeId }),
  ]);
  if (code.error || stats.error) {
    logger.error(
      `place visit code/stats failed for ${placeId}: ${
        code.error?.message ?? stats.error?.message
      }`,
    );
    return { status: 500, message: "Couldn't load the check-in code." };
  }

  const c = code.data as {
    code: string;
    expires_at: string;
    period_seconds: number;
  };
  const s = (stats.data ?? {}) as StatsJson;
  return {
    status: 200,
    data: {
      available: true,
      verified: place.verified,
      code: c.code,
      url: placeVisitUrl(place.slug, c.code, origin),
      expiresAt: c.expires_at,
      periodSeconds: num(c.period_seconds) || 30,
      perVisitorMinor: terms.perVisitorMinor,
      maxVisitors: terms.maxVisitors,
      stats: {
        today: num(s.today),
        thisMonthVisits: num(s.this_month_visits),
        thisMonthVisitors: num(s.this_month_visitors),
        lastMonthVisitors: num(s.last_month_visitors),
        earnedMinor: num(s.earned_minor),
      },
    },
  };
}

const OUTCOME_MESSAGE: Record<
  PlaceVisitOutcome,
  (name: string | null) => string
> = {
  recorded: (n) =>
    `You're checked in at ${n ?? "this place"}. Thanks for visiting!`,
  already_today: (n) =>
    `You've already checked in at ${n ?? "this place"} today.`,
  invalid_code: () =>
    "That code has changed. Scan the code on the screen again.",
  too_far: () =>
    "You need to be at the place to check in. Move closer and try again.",
  own_place: () => "You can't check in at your own place.",
  place_unavailable: () => "This place isn't taking check-ins.",
  mocked_location: () =>
    "Turn off any app that changes your location, then try again.",
  no_location: () => "We need your location to check you in.",
  poor_location: () =>
    "We couldn't get an accurate location. Wait a moment or step outside, then try again.",
  off: () => "Check-ins aren't available right now.",
};

export function placeVisitMessage(result: PlaceVisitResult): string {
  return OUTCOME_MESSAGE[result.outcome](result.placeName);
}

export type RecordPlaceVisitInput = {
  placeId?: string | null;
  placeSlug?: string | null;
  code: string;
  lat: number | null;
  lng: number | null;
  accuracyM?: number | null;
  platform: "android" | "ios" | "web";
  installId?: string | null;
  mocked?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks the caller in at a place (once a day). */
export async function recordPlaceVisitCore(
  userId: string,
  input: RecordPlaceVisitInput,
): Promise<Envelope<PlaceVisitResult>> {
  if (!userId) return { status: 401, message: "Sign in to check in." };

  const code = String(input?.code ?? "")
    .trim()
    .toUpperCase();
  if (!/^[0-9A-F]{10}$/.test(code)) {
    return {
      status: 400,
      message: "That isn't a check-in code. Scan the code the place shows.",
    };
  }
  const lat = input.lat === null ? null : Number(input.lat);
  const lng = input.lng === null ? null : Number(input.lng);
  if (
    lat === null ||
    lng === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return { status: 400, message: OUTCOME_MESSAGE.no_location(null) };
  }
  if (!["android", "ios", "web"].includes(input.platform)) {
    return { status: 400, message: "Unknown platform." };
  }

  const allowed = await checkRateLimit(`place-visit:${userId}`, 10, 300);
  if (!allowed) {
    return {
      status: 429,
      message: "Too many check-in attempts. Try again in a few minutes.",
    };
  }

  const service = getSupabaseServiceClient();
  let placeId =
    input.placeId && UUID_RE.test(input.placeId) ? input.placeId : null;
  if (!placeId && input.placeSlug) {
    const { data } = await service
      .from("place")
      .select("id")
      .eq("slug", input.placeSlug)
      .maybeSingle();
    placeId = data?.id ?? null;
  }
  if (!placeId) return { status: 404, message: "Place not found." };

  const accuracy =
    input.accuracyM === null || input.accuracyM === undefined
      ? null
      : Math.max(0, Math.round(Number(input.accuracyM)));

  const { data, error } = await service.rpc("place_visit_record", {
    p_user_id: userId,
    p_place_id: placeId,
    p_code: code,
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: Number.isFinite(accuracy) ? (accuracy as number) : null,
    p_platform: input.platform,
    p_install_id: input.installId ?? null,
    p_mocked: input.mocked === true,
  } as unknown as Database["public"]["Functions"]["place_visit_record"]["Args"]);
  if (error) {
    logger.error(`place_visit_record failed: ${error.message}`);
    return { status: 500, message: "Couldn't check you in. Try again." };
  }

  const raw = (data ?? {}) as {
    result?: PlaceVisitOutcome;
    place_name?: string;
    distance_m?: number;
  };
  const result: PlaceVisitResult = {
    outcome: raw.result && raw.result in OUTCOME_MESSAGE ? raw.result : "off",
    placeName: raw.place_name ?? null,
    distanceM: raw.distance_m ?? null,
  };
  return {
    status:
      result.outcome === "recorded" || result.outcome === "already_today"
        ? 200
        : 409,
    message: placeVisitMessage(result),
    data: result,
  };
}
