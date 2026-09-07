export type HighlightMediaType = "image" | "video" | "audio";

export type HighlightRow = {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string;
  // Optimised video rendition built at upload time. NULL for images, and for
  // videos already within the playback profile. Players prefer this and fall
  // back to media_url -- which is always the immediately-playable original --
  // if it is not ready yet. See @abonten/core/videoDelivery.
  playback_url?: string | null;
  created_at: string;
  media_type: HighlightMediaType;
  thumbnail_url: string | null;
  media_duration: number | null;
  group_id: string;
  public_id: string | null;
};

export type HighlightGroup = HighlightRow[];
