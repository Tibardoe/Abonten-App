"use client";

import { supabase } from "@/config/supabase/client";
import { MESSAGE_ATTACHMENTS_BUCKET } from "@abonten/types/messagingType";
import { useQuery } from "@tanstack/react-query";

const TTL_SECONDS = 60 * 60;

// message-attachments is a private bucket. A participant can mint their own
// signed URL directly (storage RLS: message_attachments_participant_read
// allows is_conversation_participant on folder[1]). Cached just under the
// signature's own lifetime so a long-open thread re-signs before links die.
export function useAttachmentUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["messaging", "attachment-url", storagePath],
    enabled: !!storagePath,
    staleTime: (TTL_SECONDS - 300) * 1000,
    gcTime: TTL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath as string, TTL_SECONDS);
      if (error || !data?.signedUrl) {
        throw error ?? new Error("Could not load image");
      }
      return data.signedUrl;
    },
  });
}
