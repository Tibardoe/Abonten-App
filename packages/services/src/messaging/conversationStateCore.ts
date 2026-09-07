import type { Database } from "@abonten/types/database.types";
import type {
  BlockParticipantInput,
  MessagingEnvelope,
  SetConversationStateInput,
} from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessagingRpcError } from "./messagingError";

// mark_conversation_read / set_conversation_state / block_participant are
// all SECURITY DEFINER RPCs that update only the caller's own participant
// row (or block rows) and raise 42501 for a non-participant. These wrappers
// map that to an envelope.

export async function markConversationReadCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: { conversationId: string; upTo?: string | null },
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: input.conversationId,
    p_up_to: input.upTo ?? undefined,
  } as Database["public"]["Functions"]["mark_conversation_read"]["Args"]);
  if (error) return mapMessagingRpcError(error, "markConversationReadCore");
  return { status: 200 };
}

export async function markConversationUnreadCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: { conversationId: string },
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("mark_conversation_unread", {
    p_conversation_id: input.conversationId,
  } as Database["public"]["Functions"]["mark_conversation_unread"]["Args"]);
  if (error) return mapMessagingRpcError(error, "markConversationUnreadCore");
  return { status: 200 };
}

export async function setConversationStateCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: SetConversationStateInput,
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("set_conversation_state", {
    p_conversation_id: input.conversationId,
    p_muted: input.muted ?? undefined,
    p_archived: input.archived ?? undefined,
  } as Database["public"]["Functions"]["set_conversation_state"]["Args"]);
  if (error) return mapMessagingRpcError(error, "setConversationStateCore");
  return { status: 200 };
}

export async function blockParticipantCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: BlockParticipantInput,
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("block_participant", {
    p_conversation_id: input.conversationId,
    p_blocked_id: input.blockedUserId,
    p_block: input.block,
  });
  if (error) return mapMessagingRpcError(error, "blockParticipantCore");
  return {
    status: 200,
    message: input.block ? "User blocked." : "User unblocked.",
  };
}
