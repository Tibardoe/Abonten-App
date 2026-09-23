import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  BLOCKED_ACCOUNTS_LIMIT,
  BLOCKED_ACCOUNTS_SELECT,
  type BlockedAccountRow,
  toBlockedAccount,
} from "@abonten/core/blockedAccounts";
import { useQuery } from "@tanstack/react-query";

// The people you blocked account-wide (conversation_block rows with no
// conversation). Readable only by you (conversation_block_own_select);
// blocking and unblocking go through user_block_set (useSetUserBlock).
// Web reads the same rows via @abonten/services/profile/userBlockCore.

export function useBlockedAccounts() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["mobile", "blocked-accounts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_block")
        .select(BLOCKED_ACCOUNTS_SELECT)
        .eq("blocker_id", userId as string)
        .is("conversation_id", null)
        .order("created_at", { ascending: false })
        .limit(BLOCKED_ACCOUNTS_LIMIT);
      if (error) throw error;
      return ((data ?? []) as unknown as BlockedAccountRow[]).map(
        toBlockedAccount,
      );
    },
  });
}
