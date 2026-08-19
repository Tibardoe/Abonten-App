import type { MediaItem } from "./mediaItemType";

export type HighlightUploadMetadataItem = {
  publicId: string;
  secureUrl: string;
  version: number;
  resourceType: "image" | "video";
  bytes: number;
  durationSeconds?: number | null;
  // Video only -- the user's selected trim range. The full file is always
  // uploaded; these tell the server to build a delivery URL that serves
  // only this segment (see uploadHighlight.ts).
  trimStartSeconds?: number | null;
  trimEndSeconds?: number | null;
};

// Shape Cloudinary's own direct-upload endpoint responds with.
export type CloudinaryDirectUploadResult = {
  public_id: string;
  secure_url: string;
  version: number;
  bytes: number;
  format: string;
  resource_type: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
};

export type HighlightUploadStatus =
  | "signing"
  | "uploading"
  | "saving"
  | "success"
  | "error";

export type HighlightUploadItem = {
  id: string;
  groupId: string;
  mediaItem: MediaItem;
  status: HighlightUploadStatus;
  progress: number;
  errorMessage: string | null;
};
