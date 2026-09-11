import { logger } from "@abonten/core/logger";
import {
  type InviteSource,
  bindResultMessage,
  inviteUrl,
} from "@abonten/core/rewards/invite";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import type {
  ReferralBindOutcome,
  ReferralBindResult,
  ReferralCodeInfo,
  ReferralInvite,
} from "@abonten/types/rewards";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { rewardsKillSwitchOn } from "./rewardsProgramQuery";

// Friend invites (Abonten Rewards Phase 5), shared by the web Server Actions
// and the /api/mobile routes. The transport resolves who the caller is; the
// code they send is only a hint -- referral_bind re-checks everything (new
// account, first bind wins, no circles, the inviter in good standing).

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const KNOWN_RESULTS = new Set<ReferralBindResult>([
  "bound",
  "already_bound",
  "capture_off",
  "program_off",
  "unknown_code",
  "own_code",
  "too_late",
  "not_new",
  "circular",
  "referrer_restricted",
  "not_found",
]);

function outcome(
  result: ReferralBindResult,
  extra: Partial<ReferralBindOutcome> = {},
): ReferralBindOutcome {
  return {
    result,
    referrerName: null,
    welcome: "none",
    welcomeMinor: null,
    ...extra,
  };
}

type BindEnvelope = {
  status: 200 | 400 | 429 | 500;
  message: string;
  data: ReferralBindOutcome;
};

function envelope(
  status: BindEnvelope["status"],
  data: ReferralBindOutcome,
): BindEnvelope {
  return { status, message: bindResultMessage(data).text, data };
}

/**
 * Joins the caller to the owner of `code` (a friend's invite). Safe to call
 * on every sign-in: an account that is already bound, too old, or has
 * bought or published anything just gets the matching answer.
 */
export async function bindReferralCodeCore(
  userId: string,
  input: { code: string; source: InviteSource },
): Promise<BindEnvelope> {
  const code = normalizeReferralCode(input.code);
  if (!code) return envelope(400, outcome("invalid"));
  if (rewardsKillSwitchOn()) return envelope(200, outcome("capture_off"));

  const allowed = await checkRateLimit(`referral-bind:${userId}`, 5, 3600);
  if (!allowed) return envelope(429, outcome("rate_limited"));

  const { data, error } = await getSupabaseServiceClient().rpc(
    "referral_bind",
    { p_referee: userId, p_code: code, p_source: input.source },
  );
  if (error) {
    logger.error(`referral_bind failed for ${userId}: ${error.message}`);
    return envelope(500, outcome("error"));
  }

  const json = (data ?? {}) as {
    result?: string;
    referrer_name?: string | null;
    welcome?: string | null;
    welcome_minor?: number | null;
  };
  const result = KNOWN_RESULTS.has(json.result as ReferralBindResult)
    ? (json.result as ReferralBindResult)
    : "error";

  return envelope(
    200,
    outcome(result, {
      referrerName: json.referrer_name ?? null,
      welcome:
        json.welcome === "released"
          ? "granted"
          : json.welcome === "phone_not_verified"
            ? "needs_phone"
            : "none",
      welcomeMinor: json.welcome_minor == null ? null : num(json.welcome_minor),
    }),
  );
}

/** Whether friend invites are live (the sign-in screen's invite field). */
export async function invitesLiveCore(): Promise<boolean> {
  if (rewardsKillSwitchOn()) return false;
  const service = getSupabaseServiceClient();
  const [settings, rule] = await Promise.all([
    service
      .from("reward_program_setting")
      .select("referral_capture_enabled")
      .eq("id", 1)
      .maybeSingle(),
    service
      .from("reward_rule")
      .select("id")
      .eq("rule_key", "friend_referral_referrer")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  return !!settings.data?.referral_capture_enabled && !!rule.data;
}

type StatsJson = {
  joined?: number;
  qualified?: number;
  rewarded?: number;
  earned_minor?: number;
  pending_minor?: number;
  recent?: { name: string; status: string; at: string }[];
  invited_by?: { name: string; bound_at: string } | null;
  can_bind?: boolean;
};

/**
 * The caller's invite link (their code is created on first use while
 * invites are live), the offer, and how their invites are doing.
 */
export async function getReferralInviteCore(
  userId: string,
  origin?: string,
): Promise<{ status: 200 | 500; data?: ReferralInvite; message?: string }> {
  const service = getSupabaseServiceClient();
  const [settings, rules, stats] = await Promise.all([
    service
      .from("reward_program_setting")
      .select("referral_capture_enabled")
      .eq("id", 1)
      .maybeSingle(),
    service
      .from("reward_rule")
      .select("rule_key, flat_minor, min_basis_minor")
      .eq("is_active", true)
      .in("rule_key", ["friend_referral_referrer", "friend_referral_referee"]),
    service.rpc("referral_stats", { p_user_id: userId }),
  ]);

  if (settings.error || rules.error || stats.error) {
    logger.error(
      `getReferralInviteCore failed for ${userId}: ${
        settings.error?.message ?? rules.error?.message ?? stats.error?.message
      }`,
    );
    return { status: 500, message: "Couldn't load your invites." };
  }

  const referrerRule = rules.data?.find(
    (r) => r.rule_key === "friend_referral_referrer",
  );
  const refereeRule = rules.data?.find(
    (r) => r.rule_key === "friend_referral_referee",
  );
  const enabled =
    !rewardsKillSwitchOn() &&
    !!settings.data?.referral_capture_enabled &&
    !!referrerRule;

  let code: string | null = null;
  if (enabled) {
    const { data, error } = await service.rpc("referral_ensure_code", {
      p_user_id: userId,
    });
    if (error || typeof data !== "string") {
      logger.error(
        `referral_ensure_code failed for ${userId}: ${error?.message}`,
      );
      return { status: 500, message: "Couldn't load your invites." };
    }
    code = data;
  }

  const s = (stats.data ?? {}) as StatsJson;
  return {
    status: 200,
    data: {
      enabled,
      code,
      inviteUrl: code ? inviteUrl(code, origin) : null,
      referrerMinor: referrerRule?.flat_minor ?? null,
      refereeMinor: refereeRule?.flat_minor ?? null,
      minOrderMinor:
        refereeRule?.min_basis_minor ?? referrerRule?.min_basis_minor ?? null,
      stats: {
        joined: num(s.joined),
        qualified: num(s.qualified),
        rewarded: num(s.rewarded),
        earnedMinor: num(s.earned_minor),
        pendingMinor: num(s.pending_minor),
      },
      recent: (s.recent ?? []).map((r) => ({
        name: r.name,
        status:
          r.status === "qualified" ||
          r.status === "rewarded" ||
          r.status === "expired"
            ? r.status
            : "joined",
        at: r.at,
      })),
      invitedBy: s.invited_by
        ? { name: s.invited_by.name, boundAt: s.invited_by.bound_at }
        : null,
      canBind: enabled && s.can_bind === true,
    },
  };
}

/**
 * What the public invite page shows for a code: the inviter's first name and
 * the offer. Rate-limited per caller so codes can't be enumerated.
 */
export async function resolveReferralCodeCore(
  rawCode: string,
  limiterKey: string | null,
): Promise<{ status: 200 | 400 | 429 | 500; data?: ReferralCodeInfo }> {
  const code = normalizeReferralCode(rawCode);
  const invalid: ReferralCodeInfo = {
    valid: false,
    code: null,
    programOn: false,
    referrerName: null,
    referrerAvatar: null,
    welcomeMinor: null,
    minOrderMinor: null,
  };
  if (!code) return { status: 400, data: invalid };

  if (limiterKey) {
    const allowed = await checkRateLimit(
      `referral-resolve:${limiterKey}`,
      20,
      60,
    );
    if (!allowed) return { status: 429 };
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "referral_resolve_code",
    { p_code: code },
  );
  if (error) {
    logger.error(`referral_resolve_code failed: ${error.message}`);
    return { status: 500 };
  }
  const json = (data ?? {}) as {
    valid?: boolean;
    code?: string;
    program_on?: boolean;
    referrer_name?: string | null;
    referrer_avatar_public_id?: string | null;
    referrer_avatar_version?: string | null;
    welcome_minor?: number | null;
    min_order_minor?: number | null;
  };
  if (!json.valid) return { status: 200, data: invalid };

  return {
    status: 200,
    data: {
      valid: true,
      code: json.code ?? code,
      programOn: !rewardsKillSwitchOn() && json.program_on === true,
      referrerName: json.referrer_name ?? null,
      referrerAvatar: json.referrer_avatar_public_id
        ? {
            publicId: json.referrer_avatar_public_id,
            version: json.referrer_avatar_version ?? null,
          }
        : null,
      welcomeMinor: json.welcome_minor == null ? null : num(json.welcome_minor),
      minOrderMinor:
        json.min_order_minor == null ? null : num(json.min_order_minor),
    },
  };
}
