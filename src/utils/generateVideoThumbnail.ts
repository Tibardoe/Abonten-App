export const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");

    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.addEventListener("loadeddata", () => {
      // Seek to 1 second or 0.1 if too short
      video.currentTime = Math.min(1, video.duration - 0.1);
    });

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnail = canvas.toDataURL("image/png");
        resolve(thumbnail);
      } else {
        reject("Canvas context is null");
      }

      URL.revokeObjectURL(video.src); // cleanup
    });

    video.addEventListener("error", (e) => {
      reject("Error generating video thumbnail");
    });
  });
};
