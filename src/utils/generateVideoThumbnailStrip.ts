const DEFAULT_COUNT = 9;
const DEFAULT_WIDTH = 80;

// Generates a small set of low-resolution frames spanning a video's full
// duration, for use as the trim editor's timeline background. Reuses a
// single hidden <video>/<canvas> pair across all seeks rather than creating
// one per frame. Never rejects once metadata has loaded -- if a frame fails
// to capture partway through, whatever succeeded so far is returned so the
// trim editor still has *something* to show (falls back to an empty array,
// which the caller renders as a plain track background).
export function generateVideoThumbnailStrip(
  file: File,
  options?: { count?: number; width?: number },
): Promise<string[]> {
  const count = options?.count ?? DEFAULT_COUNT;
  const width = options?.width ?? DEFAULT_WIDTH;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const url = URL.createObjectURL(file);
    const frames: string[] = [];

    let settled = false;
    const finish = (result: string[]) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    video.onerror = () => finish(frames);

    video.onloadedmetadata = async () => {
      const duration = video.duration;

      if (!duration || Number.isNaN(duration) || !Number.isFinite(duration)) {
        finish(frames);
        return;
      }

      const height = Math.round(
        width * (video.videoHeight / video.videoWidth || 9 / 16),
      );
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        finish(frames);
        return;
      }

      const seekTo = (time: number) =>
        new Promise<void>((resolveSeek) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolveSeek();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = time;
        });

      for (let i = 0; i < count; i++) {
        // Inset from the exact start/end so we don't seek to a black or
        // undecoded edge frame.
        const timestamp = ((i + 0.5) / count) * duration;

        try {
          await seekTo(Math.min(timestamp, duration - 0.05));
          ctx.drawImage(video, 0, 0, width, height);
          frames.push(canvas.toDataURL("image/jpeg", 0.6));
        } catch {
          break;
        }
      }

      finish(frames);
    };
  });
}
