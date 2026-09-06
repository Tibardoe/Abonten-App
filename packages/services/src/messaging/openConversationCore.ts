import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type {
  MessagingEnvelope,
  OpenConversationInput,
} from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessagingRpcError } from "./messagingError";

// Post-auth body of the "Chat with organizer" / "Chat with place" action.
// Thin wrapper over the open_conversation RPC (SECURITY DEFINER, keyed on
// auth.uid()) which does the get-or-create atomically — tapping Chat
// repeatedly returns the same conversation id, never a duplicate.
//
// Runs on the CALLER's session client so the RPC sees the right auth.uid();
// the RPC itself elevates to create the business-side participant + system
// message, which the caller has no direct RLS right to insert.

export async function openConversationCore(
  supabase: SupabaseClient<Database>,
  _userId: string,
  input: OpenConversationInput,
): Promise<MessagingEnvelope<{ conversationId: string }>> {
  const { data, error } = await supabase.rpc("open_conversation", {
    p_type: input.type,
    p_event_id: input.type === "event" ? input.eventId : undefined,
    p_place_id: input.type === "place" ? input.placeId : undefined,
  } as Database["public"]["Functions"]["open_conversation"]["Args"]);

  if (error) {
    return mapMessagingRpcError(error, "openConversationCore");
  }

  if (!data) {
    logger.error("openConversationCore: RPC returned no conversation id");
    return { status: 500, message: "Something went wrong. Please try again." };
  }

  return { status: 200, data: { conversationId: data as string } };
}
