import { logger } from "@abonten/core/logger";
import type {
  NotificationPreferences,
  NotificationPreferencesPatch,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { resolveDiscoveryAccess } from "../search/discoveryProgram";
import { writeRecommendationEmailConsent } from "./recommendationEmailPreferenceCore";

// The notification preference centre (web Settings › Notifications, app
// Settings › Notifications). Only optional categories have a switch;
// transactional notices (tickets, payments, refunds, cancellations,
// security, verification) cannot be turned off and have no key here.
//
// A person with no notification_preference row has every push switch on and
// no subscriptions, so nothing optional reaches them until they opt in.
// Choices are checked again at send time (notification_delivery_claim), so a
// change applies to anything already queued.
//
// Recommendation email is different: it defaults off, can only be switched
// on while the programme allows it (legal item G1 gates that) and the account
// has an email address, and every change is written to the consent record
// (recommendationEmailPreferenceCore). Switching it off is always allowed.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 500;
  message?: string;
  data?: T;
};

const PAUSE_DAYS = 14;

const COLUMN: Record<
  Exclude<keyof NotificationPreferencesPatch, "pause" | "recommendationEmails">,
  string
> = {
  recommendationsPush: "recommendations_push",
  organizerAlertsPush: "organizer_alerts_push",
  placeUpdatesPush: "place_updates_push",
  socialPush: "social_push",
  rewardEmails: "reward_emails",
};

export async function getNotificationPreferencesCore(
  service: ServiceRoleClient,
  userId: string,
): Promise<Envelope<NotificationPreferences>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  const [pref, authUser] = await Promise.all([
    service
      .from("notification_preference")
      .select(
        "reward_emails, recommendations_push, organizer_alerts_push, place_updates_push, social_push, paused_until, recommendations_email, organizer_alerts_email, place_updates_email",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    service.auth.admin.getUserById(userId),
  ]);
  if (pref.error) {
    logger.error(`notification_preference read failed: ${pref.error.message}`);
    return {
      status: 500,
      message: "Couldn't load your notification settings.",
    };
  }
  const row = pref.data;
  const pausedUntil =
    row?.paused_until && new Date(row.paused_until).getTime() > Date.now()
      ? row.paused_until
      : null;
  return {
    status: 200,
    data: {
      recommendationsPush: row?.recommendations_push ?? true,
      organizerAlertsPush: row?.organizer_alerts_push ?? true,
      placeUpdatesPush: row?.place_updates_push ?? true,
      socialPush: row?.social_push ?? true,
      rewardEmails: row?.reward_emails ?? true,
      recommendationEmails: !!(
        row?.recommendations_email ||
        row?.organizer_alerts_email ||
        row?.place_updates_email
      ),
      pausedUntil,
      email: authUser.data.user?.email ?? null,
    },
  };
}

export async function updateNotificationPreferencesCore(
  service: ServiceRoleClient,
  userId: string,
  patch: NotificationPreferencesPatch,
  /** Where the change was made, for the email consent record. */
  surface: "web" | "app" = "web",
): Promise<Envelope<NotificationPreferences>> {
  if (!userId) return { status: 401, message: "User not logged in" };

  const emailChoice = patch.recommendationEmails;
  if (emailChoice !== undefined && typeof emailChoice !== "boolean") {
    return { status: 400, message: "Choose on or off." };
  }
  if (emailChoice === true) {
    const [{ program }, authUser] = await Promise.all([
      resolveDiscoveryAccess(service, userId),
      service.auth.admin.getUserById(userId),
    ]);
    if (!program.recommendationEmail) {
      return {
        status: 403,
        message: "Emails about picks aren't available yet.",
      };
    }
    if (!authUser.data.user?.email) {
      return {
        status: 400,
        message: "Add an email address to your account first.",
      };
    }
  }

  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(COLUMN)) {
    const value = patch[key as keyof typeof COLUMN];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return { status: 400, message: "Choose on or off." };
    }
    update[column] = value;
  }
  if (patch.pause === "two_weeks") {
    update.paused_until = new Date(
      Date.now() + PAUSE_DAYS * 86_400_000,
    ).toISOString();
  } else if (patch.pause === "resume") {
    update.paused_until = null;
  } else if (patch.pause !== undefined) {
    return { status: 400, message: "Unknown pause option." };
  }
  if (Object.keys(update).length === 0 && emailChoice === undefined) {
    return { status: 400, message: "Nothing to change." };
  }

  if (Object.keys(update).length > 0) {
    const { error } = await service.from("notification_preference").upsert(
      {
        user_id: userId,
        ...update,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );
    if (error) {
      logger.error(`notification_preference write failed: ${error.message}`);
      return {
        status: 500,
        message: "Couldn't save your notification settings.",
      };
    }
  }
  if (emailChoice !== undefined) {
    const res = await writeRecommendationEmailConsent(
      service,
      userId,
      emailChoice,
      surface === "app" ? "settings_app" : "settings_web",
    );
    if (!res.ok) {
      return {
        status: 500,
        message: "Couldn't save your notification settings.",
      };
    }
  }

  const fresh = await getNotificationPreferencesCore(service, userId);
  if (fresh.status !== 200) return fresh;
  return {
    ...fresh,
    message:
      patch.pause === "two_weeks"
        ? "Alerts and picks paused for two weeks."
        : patch.pause === "resume"
          ? "Alerts and picks resumed."
          : "Saved.",
  };
}
