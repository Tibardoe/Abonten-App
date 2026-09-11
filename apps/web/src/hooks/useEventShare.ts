"use client";

import { recordEventShare } from "@/actions/recordEventShare";
import { useReferralCode } from "@/hooks/useReferralCode";
import { handleShare } from "@/utils/handleShare";
import { withReferralCode } from "@abonten/core/rewards/referralCode";

// Share an event: the link carries the signed-in sharer's referral code
// (?ref=) while referral capture is on, so a ticket bought through it can
// earn them credit. Each share is logged (analytics only).
export function useEventShare({
  eventId,
  title,
  url,
}: {
  eventId?: string;
  title: string;
  url: string;
}) {
  const code = useReferralCode();
  const shareUrl = withReferralCode(url, code);

  return async () => {
    const channel = await handleShare({ title, url: shareUrl });
    if (channel && eventId && code) {
      recordEventShare({ eventId, channel, referralCode: code }).catch(
        () => {},
      );
    }
  };
}
