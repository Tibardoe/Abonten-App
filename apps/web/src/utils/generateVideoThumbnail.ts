export const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    // Handle error loading video
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject("Error loading video for thumbnail generation.");
    };

    // When metadata is loaded, we can seek
    video.onloadedmetadata = () => {
      const duration = video.duration;

      if (!duration || Number.isNaN(duration)) {
        URL.revokeObjectURL(url);
        reject("Invalid video duration.");
        return;
      }

      const seekTo = Math.min(3, video.duration - 0.1); // Seek to 3s or middle of video

      // Listen for seek completion
      video.currentTime = seekTo;

      video.onseeked = () => {
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Failed to get canvas context.");

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL("image/png");

          resolve(thumbnail);
        } catch (err) {
          reject("Thumbnail generation failed.");
        } finally {
          URL.revokeObjectURL(url);
        }
      };
    };
  });
};
