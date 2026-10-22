import SafetyEmailTemplate from "@/components/organisms/SafetyEmailTemplate";
import { emailIsConfigured, sendEmail } from "@/lib/email/sendEmail";
import { logger } from "@abonten/core/logger";
import type {
  SafetyEmail,
  SafetyEmailResult,
} from "@abonten/services/safety/safetyNotifyCore";

/**
 * Sends one Abonten Safety email (an alert, a check-in that lapsed, a shared
 * location, a follow-up or an invite) to a trusted contact. Lent to the
 * Safety services by every transport that can start or finish a session and
 * by POST /api/safety/dispatch: rendering the React email and holding the
 * Resend key belong to the web app. Never throws; the result tells the
 * outbox whether to try again.
 */
export async function sendSafetyEmail(
  email: SafetyEmail,
): Promise<SafetyEmailResult> {
  if (!emailIsConfigured()) {
    return { ok: false, error: "email_not_configured", retry: false };
  }
  try {
    const { error } = await sendEmail(
      {
        from: "Abonten Safety <alerts@abontenhub.com>",
        to: [email.to],
        subject: email.subject,
        headers: email.urgent ? { Importance: "high", "X-Priority": "1" } : {},
        react: SafetyEmailTemplate({
          locale: email.locale,
          heading: email.heading,
          intro: email.intro,
          buttonLabel: email.buttonLabel,
          buttonUrl: email.buttonUrl,
          lines: email.lines,
          footer: email.footer,
        }),
      },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error) {
      logger.error(`Safety email failed: ${error.message}`);
      const permanent = /invalid|validation/i.test(
        `${error.name} ${error.message}`,
      );
      return {
        ok: false,
        error: error.message.slice(0, 200),
        retry: !permanent,
      };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`Safety email failed unexpectedly: ${e}`);
    return { ok: false, error: "send_failed", retry: true };
  }
}

/** What every Safety transport lends the services. */
export const safetyDeps = { sendEmail: sendSafetyEmail };
