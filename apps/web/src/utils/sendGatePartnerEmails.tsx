import "server-only";

import ticketPurchaseNotification from "@/actions/ticketPurchaseNotification";
import GateVoidEmailTemplate from "@/components/organisms/GateVoidEmailTemplate";
import { emailWordsFor } from "@/lib/email/emailWords";
import { emailIsConfigured, sendEmail } from "@/lib/email/sendEmail";
import { gatePartnerName } from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import type { GatePushDeps } from "@abonten/services/gatePartners/gatePushCore";
import type { GateVoidEmail } from "@abonten/services/gatePartners/gateVoidCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// The emails of gate partner connectors (docs/architecture/
// gate-partner-connectors.md), injected into @abonten/services by the
// gate-partners job (rendering React email and holding the Resend key
// belong to the web app). Neither throws: the in-app notice already went.

/** A buyer's partner codes arrived after their receipt: the tickets again. */
export const sendGateCodesReadyEmail: NonNullable<
  GatePushDeps["onCodesReady"]
> = async ({ userId, ticketIds }) => {
  const res = await ticketPurchaseNotification(
    ticketIds,
    null,
    { supabase: getSupabaseServiceClient(), userId },
    "gate_codes_ready",
  );
  if (res.status !== 200) {
    logger.error(`Gate codes email not sent: ${res.message ?? res.status}`);
  }
};

/** The organizer (or a team's Owners and Managers): codes to void. */
export async function sendGateVoidEmail(email: GateVoidEmail): Promise<void> {
  if (!emailIsConfigured()) {
    logger.warn("RESEND_API_KEY is not set; skipping gate void emails");
    return;
  }
  const db = getSupabaseServiceClient();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com";
  const partner = gatePartnerName(email.provider);
  for (const userId of email.recipientIds) {
    try {
      const [{ data: auth }, { data: info }] = await Promise.all([
        db.auth.admin.getUserById(userId),
        db
          .from("user_info")
          .select("full_name, username")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const to = auth?.user?.email;
      if (!to) continue;
      const words = await emailWordsFor(
        userId,
        info?.full_name ?? info?.username ?? null,
      );
      const { error } = await sendEmail({
        from: "Abonten Hub <tickets@abontenhub.com>",
        to: [to],
        subject: words.t("gateVoid.subject", {
          count: email.codes.length,
          eventTitle: email.eventTitle,
        }),
        react: GateVoidEmailTemplate({
          words,
          eventTitle: email.eventTitle,
          partner,
          codes: email.codes,
          manageUrl: `${base}/manage/events/${email.eventId}`,
        }),
      });
      if (error) {
        logger.error(`Gate void email failed: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Gate void email failed unexpectedly: ${error}`);
    }
  }
}
