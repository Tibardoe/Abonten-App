"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getReferralInviteCore } from "@abonten/services/rewards/inviteCore";
import type { ReferralInvite } from "@abonten/types/rewards";

/**
 * The signed-in user's friend-invite link, the offer, and how their
 * invites are doing (Rewards › Invite friends).
 */
export const getReferralInvite = withActionLocale(
  async function getReferralInvite(): Promise<{
    status: number;
    message?: string;
    data?: ReferralInvite;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };

    return getReferralInviteCore(
      user.id,
      process.env.NEXT_PUBLIC_BASE_URL || undefined,
    );
  },
);
