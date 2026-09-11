import RewardUpdateEmailTemplate from "@/components/organisms/RewardUpdateEmailTemplate";
import { logger } from "@abonten/core/logger";
import type {
  EmailSendResult,
  RewardEmail,
} from "@abonten/services/notifications/deliveryCore";
import { rewardEmailUnsubscribeLinks } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import { Resend } from "resend";

/**
 * Sends one Abonten Rewards email for the notification delivery queue
 * (@abonten/services/notifications/deliveryCore). Injected into the core by
 * POST /api/notifications/deliver, because rendering the React email and
 * holding the Resend key belong to the web app. Never throws: the result
 * tells the queue whether to retry.
 */
export async function sendRewardUpdateEmail(
  email: RewardEmail,
): Promise<EmailSendResult> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY is not set; skipping reward emails");
    return { ok: false, error: "email_not_configured", outcome: "skip" };
  }

  const subject =
    email.items.length === 1
      ? email.items[0].title
      : `Abonten Rewards: ${email.items.length} updates`;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com";

  try {
    // One-click unsubscribe (RFC 8058) for Gmail / Yahoo / Outlook's own
    // "Unsubscribe" button, plus the link in the email's footer.
    const unsubscribe = rewardEmailUnsubscribeLinks(email.userId, base);
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "Abonten Rewards <rewards@abontenhub.com>",
      to: [email.to],
      subject,
      headers: {
        "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      react: RewardUpdateEmailTemplate({
        name: email.name,
        items: email.items,
        rewardsUrl: `${base}/rewards`,
        unsubscribeUrl: unsubscribe.page,
      }),
    });
    if (error) {
      logger.error(`Reward email failed: ${error.message}`);
      // A rejected address or payload won't get better on retry.
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
    logger.error(`Reward email failed unexpectedly: ${e}`);
    return { ok: false, error: "send_failed", outcome: "retry" };
  }
}
