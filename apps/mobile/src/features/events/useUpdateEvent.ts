import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type { UpdateEventBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native echo of the web useEventEditForm submit path: if the organizer
// picked a replacement flyer, upload it straight to Cloudinary with a
// short-lived signature (kind "event_flyer") first, then PATCH the rest to
// /api/mobile/organizer/events/:id, which runs the same updateEventCore the
// web updateEvent action runs. Omitting the flyer keeps the current one.

export type UpdateEventInput = Omit<
  UpdateEventBody,
  "flyerPublicId" | "flyerVersion"
> & {
  eventId: string;
  /** Local file URI of a newly-picked flyer, or null to keep the current one. */
  flyerUri?: string | null;
};

export function useUpdateEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, flyerUri, ...rest }: UpdateEventInput) => {
      let flyerPublicId: string | undefined;
      let flyerVersion: string | undefined;

      if (flyerUri) {
        const { publicId, version } = await uploadToCloudinary(
          flyerUri,
          "event_flyer",
        );
        flyerPublicId = publicId;
        flyerVersion = String(version);
      }

      return api.organizer.updateEvent(eventId, {
        ...rest,
        flyerPublicId,
        flyerVersion,
      });
    },
    onSuccess: (res, vars) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["discovery"] });
        qc.invalidateQueries({ queryKey: ["explore"] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({
          queryKey: ["mobile", "organizer", "event-insights", vars.eventId],
        });
        qc.invalidateQueries({ queryKey: ["mobile", "event", vars.eventId] });
      }
    },
  });
}
