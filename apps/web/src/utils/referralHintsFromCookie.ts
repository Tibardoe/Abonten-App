import { logger } from "@abonten/core/logger";
import { storedToTouch } from "@abonten/core/rewards/referralAttribution";
import {
  DEVICE_COOKIE_NAME,
  REFERRAL_COOKIE_NAME,
  decodeReferralCookie,
} from "@abonten/services/rewards/referralCookie";
import type { ReferralHint } from "@abonten/types/rewards";
import { cookies } from "next/headers";

// The event referral links this browser opened (signed abn_ref cookie, set
// by proxy.ts), as hints for a checkout or a Pay small small plan. Keys are
// `e:<event slug>`; the core matches them to the event and re-validates
// everything. Only ever what the server read from its own signed cookie --
// never a referral passed in by the browser.
export async function referralHintsFromCookie(): Promise<{
  hints: ReferralHint[];
  installId: string | null;
}> {
  try {
    const store = await cookies();
    const map = decodeReferralCookie(store.get(REFERRAL_COOKIE_NAME)?.value);
    const hints: ReferralHint[] = [];
    for (const [key, stored] of Object.entries(map)) {
      const touch = storedToTouch(stored);
      if (key.startsWith("e:") && touch) {
        hints.push({ ...touch, eventSlug: key.slice(2) });
      }
    }
    return { hints, installId: store.get(DEVICE_COOKIE_NAME)?.value ?? null };
  } catch (error) {
    logger.error(`Could not read the referral cookie: ${error}`);
    return { hints: [], installId: null };
  }
}
