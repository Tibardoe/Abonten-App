import {
  BLOCKED_ACCOUNTS_LIMIT,
  BLOCKED_ACCOUNTS_SELECT,
  type BlockedAccount,
  type BlockedAccountRow,
  toBlockedAccount,
} from "@abonten/core/blockedAccounts";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Account-wide blocking: a conversation_block row with no conversation.
// Messaging (send_message), Spotlight, comments, follows and notifications
// already honour it (content_users_blocked); reviews by people you blocked
// are left out of review_list. user_block_set() (migration 20260923090000)
// is the write — auth.uid()-scoped, so it runs as the caller — and also ends
// any follow between the two people.
//
// Mobile calls user_block_set directly and reads the list with its own
// client (conversation_block_own_select lets a person read the blocks they
// made); these are web's wrappers around the same calls. Pass the caller's
// own client.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 500;
  message?: string;
  data?: T;
};

export async function setUserBlockCore(
  supabase: SupabaseClient<Database>,
  input: { blockedUserId: string; block: boolean },
): Promise<Envelope<{ blocked: boolean }>> {
  const { data, error } = await supabase.rpc("user_block_set", {
    p_blocked_id: input.blockedUserId,
    p_block: input.block,
  });
  if (error) {
    switch (error.code) {
      case "42501":
        return { status: 401, message: error.message };
      case "P0002":
        return { status: 404, message: error.message };
      case "23514":
      case "22P02":
        return { status: 400, message: error.message };
      default:
        logger.error(`user_block_set failed: ${error.message}`);
        return { status: 500, message: "Couldn't update that. Try again." };
    }
  }
  return { status: 200, data: { blocked: data === true } };
}

export async function listBlockedAccountsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Envelope<BlockedAccount[]>> {
  const { data, error } = await supabase
    .from("conversation_block")
    .select(BLOCKED_ACCOUNTS_SELECT)
    .eq("blocker_id", userId)
    .is("conversation_id", null)
    .order("created_at", { ascending: false })
    .limit(BLOCKED_ACCOUNTS_LIMIT);
  if (error) {
    logger.error(`listBlockedAccountsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load blocked accounts." };
  }
  return {
    status: 200,
    data: ((data ?? []) as unknown as BlockedAccountRow[]).map(
      toBlockedAccount,
    ),
  };
}
