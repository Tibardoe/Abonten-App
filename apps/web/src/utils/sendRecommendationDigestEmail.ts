import RecommendationDigestEmailTemplate from "@/components/organisms/RecommendationDigestEmailTemplate";
import { SUPPORT_EMAIL } from "@abonten/core/brand/contacts";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { logger } from "@abonten/core/logger";
import type {
  EmailSendResult,
  RecommendationEmail,
  RecommendationEmailItem,
} from "@abonten/services/notifications/deliveryCore";
import { recommendationEmailUnsubscribeLinks } from "@abonten/services/notifications/recommendationEmailPreferenceCore";
import { Resend } from "resend";

// Accra wall-clock time, the same wording as the push ("Sat 20 Sep, 7:30pm").
const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function reason(item: RecommendationEmailItem): string {
  switch (item.reason) {
    case "organizer":
      return item.organizerUsername
        ? `New from @${item.organizerUsername}`
        : "From an organizer you follow";
    case "place":
      return "At a place you follow";
    case "similar_places":
      return "Similar to places you liked";
    default:
      return "Similar to events you liked";
  }
}

/**
 * Sends one recommendation digest email for the delivery queue
 * (@abonten/services/notifications/deliveryCore). Injected by POST
 * /api/notifications/deliver, like sendRewardUpdateEmail. Links go through
 * /notifications/open so opening the email counts as opening the digest (the
 * caps pause people who never open). No tracking pixel. Never throws.
 */
export async function sendRecommendationDigestEmail(
  email: RecommendationEmail,
): Promise<EmailSendResult> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY is not set; skipping recommendation emails");
    return { ok: false, error: "email_not_configured", outcome: "skip" };
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com";
  const open = (path: string) =>
    `${base}/notifications/open?id=${encodeURIComponent(email.notificationId)}&to=${encodeURIComponent(path)}`;

  try {
    const unsubscribe = recommendationEmailUnsubscribeLinks(email.userId, base);
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "Abonten Hub <picks@abontenhub.com>",
      to: [email.to],
      // Nobody reads the sending address; a reply reaches support.
      replyTo: SUPPORT_EMAIL,
      subject: email.headline,
      headers: {
        "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      react: RecommendationDigestEmailTemplate({
        name: email.name,
        headline: email.headline,
        items: email.items.map((item) => ({
          title: item.title,
          detail:
            item.subjectType === "event" && item.startsAt
              ? [WHEN.format(new Date(item.startsAt)), item.subtitle]
                  .filter(Boolean)
                  .join(" · ")
              : item.subtitle,
          reason: reason(item),
          // Plain JPEG: some mail clients can't show the WebP/AVIF that
          // f_auto would pick.
          imageUrl: item.imagePublicId
            ? buildCloudinaryUrl(item.imagePublicId, item.imageVersion, {
                width: 64,
                height: 64,
                lossless: true,
              })
            : null,
          href: open(item.path),
        })),
        forYouUrl: open("/for-you"),
        settingsUrl: `${base}/settings/notifications`,
        unsubscribeUrl: unsubscribe.page,
      }),
    });
    if (error) {
      logger.error(`Recommendation email failed: ${error.message}`);
      const permanent = /invalid|validation/i.test(
        `${error.name} ${error.message}`,
      );
      return {
        ok: false,
        error: error.message.slice(0, 200),
        outcome: permanent ? "skip" : "retry",
      };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`Recommendation email failed unexpectedly: ${e}`);
    return { ok: false, error: "send_failed", outcome: "retry" };
  }
}
