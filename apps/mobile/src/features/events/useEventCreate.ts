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
  /** Local file URI of a freshly picked (and cropped) flyer — uploaded here.
   *  Omit and pass `flyerPublicId` / `flyerVersion` instead when publishing
   *  a resumed draft whose flyer is already on Cloudinary. */
  flyerUri?: string | null;
  flyerPublicId?: string;
  flyerVersion?: string;
};

export function useEventCreate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      flyerUri,
      flyerPublicId,
      flyerVersion,
      ...rest
    }: CreateEventInput) => {
      let publicId = flyerPublicId;
      let version = flyerVersion;
      if (flyerUri) {
        const up = await uploadToCloudinary(flyerUri, "event_flyer");
        publicId = up.publicId;
        version = String(up.version);
      }
      if (!publicId || !version) {
        throw new Error("A flyer is required");
      }
      return api.events.create({
        ...rest,
        flyerPublicId: publicId,
        flyerVersion: version,
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
