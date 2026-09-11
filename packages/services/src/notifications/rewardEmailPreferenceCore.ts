import { logger } from "@abonten/core/logger";
import type { RewardEmailPreference } from "@abonten/types/rewards";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../security/signing";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Whether someone gets Abonten Rewards emails (credit ready, welcome
// credit, promotion credit). On by default; turned off from the Rewards page
// (web action / PUT /api/mobile/notifications/reward-emails) or from the
// unsubscribe link in every reward email, which works without signing in:
// it carries the person's id and an HMAC of it, so only a link we sent can
// change their choice. The delivery queue skips emails for anyone who
// opted out (notification_delivery_claim).

const PURPOSE = "reward-email-unsubscribe:v1";

type Envelope<T> = { status: number; message?: string; data?: T };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rewardEmailUnsubscribeToken(userId: string): string {
  return hmacBase64Url(deriveSigningKey(PURPOSE), userId);
}

/** The two links in a reward email: the page, and the one-click endpoint. */
export function rewardEmailUnsubscribeLinks(userId: string, baseUrl: string) {
  const query = `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(
    rewardEmailUnsubscribeToken(userId),
  )}`;
  return {
    page: `${baseUrl}/unsubscribe/rewards?${query}`,
    oneClick: `${baseUrl}/api/notifications/unsubscribe?${query}`,
  };
}

function tokenValid(userId: string, token: string): boolean {
  if (!UUID.test(userId) || !token) return false;
  try {
    return signaturesMatch(token, rewardEmailUnsubscribeToken(userId));
  } catch {
    return false;
  }
}

async function readPreference(
  userId: string,
): Promise<Envelope<RewardEmailPreference>> {
  const service = getSupabaseServiceClient();
  const [pref, authUser] = await Promise.all([
    service
      .from("notification_preference")
      .select("reward_emails")
      .eq("user_id", userId)
      .maybeSingle(),
    service.auth.admin.getUserById(userId),
  ]);
  if (pref.error) {
    logger.error(`notification_preference read failed: ${pref.error.message}`);
    return { status: 500, message: "Couldn't load your email settings." };
  }
  return {
    status: 200,
    data: {
      rewardEmails: pref.data?.reward_emails !== false,
      email: authUser.data.user?.email ?? null,
    },
  };
}

async function writePreference(
  userId: string,
  enabled: boolean,
): Promise<Envelope<RewardEmailPreference>> {
  const { error } = await getSupabaseServiceClient()
    .from("notification_preference")
    .upsert(
      {
        user_id: userId,
        reward_emails: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    logger.error(`notification_preference write failed: ${error.message}`);
    return { status: 500, message: "Couldn't save your email settings." };
  }
  const res = await readPreference(userId);
  return {
    ...res,
    message: enabled
      ? "You'll get emails about your credit."
      : "You won't get emails about your credit.",
  };
}

export async function getRewardEmailPreferenceCore(
  userId: string,
): Promise<Envelope<RewardEmailPreference>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  return readPreference(userId);
}

export async function setRewardEmailPreferenceCore(
  userId: string,
  input: { enabled: unknown },
): Promise<Envelope<RewardEmailPreference>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (typeof input.enabled !== "boolean") {
    return { status: 400, message: "Choose on or off." };
  }
  return writePreference(userId, input.enabled);
}

/** From the email's link: no sign-in, the token proves we sent it. */
export async function setRewardEmailsByTokenCore(input: {
  userId: unknown;
  token: unknown;
  enabled: boolean;
}): Promise<Envelope<{ rewardEmails: boolean }>> {
  const userId = typeof input.userId === "string" ? input.userId : "";
  const token = typeof input.token === "string" ? input.token : "";
  if (!tokenValid(userId, token)) {
    return {
      status: 400,
      message:
        "This link isn't valid. Open the link from your latest email, or change it on your Rewards page.",
    };
  }
  const res = await writePreference(userId, input.enabled);
  return {
    status: res.status,
    message: res.message,
    data: res.data ? { rewardEmails: res.data.rewardEmails } : undefined,
  };
}

/** Whether an unsubscribe link is genuine, without changing anything. */
export function isRewardEmailLinkValid(
  userId: unknown,
  token: unknown,
): boolean {
  return (
    typeof userId === "string" &&
    typeof token === "string" &&
    tokenValid(userId, token)
  );
}
