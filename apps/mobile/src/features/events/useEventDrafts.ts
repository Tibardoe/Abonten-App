import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type {
  EventDraftPayload,
  SaveEventDraftBody,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Event save-as-draft — the native echo of the web useEventUploadForm's
// saveDraft path + the DraftsView list. A draft's flyer is uploaded from
// the device (kind "event_flyer") before the payload is saved; the drafts
// list and the create wizard share the same drafts/event_drafts rows the
// web actions write.

const KEY = ["mobile", "organizer", "event-drafts"] as const;

export function useEventDrafts() {
  return useQuery({
    queryKey: [...KEY],
    queryFn: () => api.organizer.eventDrafts(),
    staleTime: 15_000,
  });
}

export function useEventDraft(draftId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, draftId],
    queryFn: () => api.organizer.eventDraft(draftId as string),
    enabled: !!draftId,
  });
}

export type SaveEventDraftInput = {
  draftId?: string;
  payload: EventDraftPayload;
  expectedUpdatedAt?: string;
  /** A newly picked local flyer URI to upload before saving, or null to
   *  leave the draft's current flyer untouched. */
  flyerUri?: string | null;
};

export function useSaveEventDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ flyerUri, ...rest }: SaveEventDraftInput) => {
      const body: SaveEventDraftBody = { ...rest };
      if (flyerUri) {
        const up = await uploadToCloudinary(flyerUri, "event_flyer");
        body.flyerPublicId = up.publicId;
        body.flyerVersion = String(up.version);
      }
      return api.organizer.saveEventDraft(body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY] }),
  });
}

export function useDeleteEventDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => api.organizer.deleteEventDraft(draftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY] }),
  });
}
