import type { Database } from "@abonten/types/database.types";
import type {
  MessagingEnvelope,
  ToggleMessageReactionInput,
} from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessagingRpcError } from "./messagingError";

// Thin wrapper over toggle_message_reaction (SECURITY DEFINER, self-authorizes
// on auth.uid(), re-checks conversation membership, constrains the emoji to
// the fixed palette). The single write path for reactions — shared by the web
// toggleMessageReaction Server Action and POST /api/mobile/messages/react.
//
// Returns `{ added }` so the caller can reconcile an optimistic toggle: the
// RPC adds the caller's reaction, or removes it if it was already present.

export async function toggleReactionCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: ToggleMessageReactionInput,
): Promise<MessagingEnvelope<{ added: boolean }>> {
  const { data, error } = await supabase.rpc("toggle_message_reaction", {
    p_message_id: input.messageId,
    p_emoji: input.emoji,
  });
  if (error) return mapMessagingRpcError(error, "toggleReactionCore");

  // `returns table (added boolean)` -> a one-row array.
  const added = Array.isArray(data) ? (data[0]?.added ?? true) : true;
  return {
    status: 200,
    message: added ? "Reaction added." : "Reaction removed.",
    data: { added },
  };
}
