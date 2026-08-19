export type MediaItem = {
  id: string; // Stable client-side identity -- never use array index for CRUD/keying.
  url: string;
  file: File;
  type: "image" | "video";
  duration?: number; // Original full duration for videos
  startTime?: number; // Trimmed start time
  endTime?: number; // Trimmed end time
  thumbnail?: string;
  timelineThumbnails?: string[]; // Small frames spanning full duration, for the trim timeline background
};
