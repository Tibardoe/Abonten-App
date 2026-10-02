"use client";

import { recordEventShare } from "@/actions/recordEventShare";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useToast } from "@/hooks/useToast";
import { handleShare } from "@/utils/handleShare";
import { withReferralCode } from "@abonten/core/rewards/referralCode";
import { useTranslations } from "next-intl";

// Share an event: the link carries the signed-in sharer's referral code
// (?ref=) while referral capture is on, so a ticket bought through it can
// earn them credit. Each share is logged (analytics only).
export function useEventShare({
  eventId,
  title,
  url,
  text,
}: {
  eventId?: string;
  title: string;
  url: string;
  text?: string;
}) {
  const t = useTranslations("common");
  const toast = useToast();
  const code = useReferralCode();
  const shareUrl = withReferralCode(url, code);

  return async () => {
    const outcome = await handleShare({ title, url: shareUrl, text });
    if (outcome === "dismissed") return;
    if (outcome === "failed") {
      toast.error(t("couldnTShare"));
      return;
    }
    if (outcome === "copy") toast.success(t("linkCopiedToClipboard"));
    if (eventId && code) {
      recordEventShare({
        eventId,
        channel: outcome,
        referralCode: code,
      }).catch(() => {});
    }
  };
}
