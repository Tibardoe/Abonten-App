export type MediaItem = {
  url: string;
  file: File;
  type: "image" | "video";
  duration?: number; // Original full duration for videos
  startTime?: number; // Trimmed start time
  endTime?: number; // Trimmed end time
  thumbnail?: string;
};
