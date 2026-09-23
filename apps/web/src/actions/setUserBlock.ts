"use server";

import { createClient } from "@/config/supabase/server";
import { setUserBlockCore } from "@abonten/services/profile/userBlockCore";

// Block (or unblock) someone across Abonten: messages, Spotlight, follows
// and reviews. user_block_set runs as the caller and ends any follow between
// the two people.
export async function setUserBlock(input: {
  userId: string;
  block: boolean;
}): Promise<{ status: number; message?: string; data?: { blocked: boolean } }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: 401, message: "Sign in to block someone." };
  }
  return setUserBlockCore(supabase, {
    blockedUserId: input.userId,
    block: input.block,
  });
}
