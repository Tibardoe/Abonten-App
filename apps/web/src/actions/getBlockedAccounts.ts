"use server";

import { createClient } from "@/config/supabase/server";
import type { BlockedAccount } from "@abonten/core/blockedAccounts";
import { listBlockedAccountsCore } from "@abonten/services/profile/userBlockCore";

// The people the signed-in user has blocked, for Settings › Blocked accounts.
export async function getBlockedAccounts(): Promise<{
  status: number;
  message?: string;
  data?: BlockedAccount[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not authenticated" };
  return listBlockedAccountsCore(supabase, user.id);
}
