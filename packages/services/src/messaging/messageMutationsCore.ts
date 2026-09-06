import type { Database } from "@abonten/types/database.types";
import type { MessagingEnvelope } from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessagingRpcError } from "./messagingError";

// Thin wrappers over edit_message / delete_message (SECURITY DEFINER,
// author-only, 15-minute edit window, soft delete). All the rules live in
// the RPC; these just translate the raise into an envelope.

export async function editMessageCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: { messageId: string; content: string },
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("edit_message", {
    p_message_id: input.messageId,
    p_content: input.content,
  });
  if (error) return mapMessagingRpcError(error, "editMessageCore");
  return { status: 200, message: "Message updated." };
}

export async function deleteMessageCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: { messageId: string },
): Promise<MessagingEnvelope<never>> {
  const { error } = await supabase.rpc("delete_message", {
    p_message_id: input.messageId,
  });
  if (error) return mapMessagingRpcError(error, "deleteMessageCore");
  return { status: 200, message: "Message deleted." };
}
