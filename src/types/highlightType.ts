export type HighlightMediaType = "image" | "video" | "audio";

export type HighlightRow = {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string;
  created_at: string;
  media_type: HighlightMediaType;
  thumbnail_url: string | null;
  media_duration: number | null;
  group_id: string;
  public_id: string | null;
};

export type HighlightGroup = HighlightRow[];
