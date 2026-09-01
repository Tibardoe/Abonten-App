import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type { EventCreateBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native echo of the web useEventUploadForm submit path: upload the flyer
// straight to Cloudinary with a short-lived signature (kind "event_flyer"),
// then POST the rest to /api/mobile/events, which runs the same
// postEventCore the web postEvent action runs. `clientRequestId` is
// generated once by the wizard and reused across retries so a replay
// returns the same event instead of a duplicate.

export type CreateEventInput = Omit<
  EventCreateBody,
  "flyerPublicId" | "flyerVersion"
> & {
  /** Local file URI of the picked (and cropped) flyer. */
  flyerUri: string;
};

export function useEventCreate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ flyerUri, ...rest }: CreateEventInput) => {
      const { publicId, version } = await uploadToCloudinary(
        flyerUri,
        "event_flyer",
      );
      return api.events.create({
        ...rest,
        flyerPublicId: publicId,
        flyerVersion: String(version),
      });
    },
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["discovery"] });
        qc.invalidateQueries({ queryKey: ["explore"] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
      }
    },
  });
}
