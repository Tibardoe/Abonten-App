"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import type { BlockedAccount } from "@abonten/core/blockedAccounts";
import { tr } from "@abonten/services/i18n/requestLocale";
import { listBlockedAccountsCore } from "@abonten/services/profile/userBlockCore";

// The people the signed-in user has blocked, for Settings › Blocked accounts.
export const getBlockedAccounts = withActionLocale(
  async function getBlockedAccounts(): Promise<{
    status: number;
    message?: string;
    data?: BlockedAccount[];
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotAuthenticated") };
    return listBlockedAccountsCore(supabase, user.id);
  },
);
