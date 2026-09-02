import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type {
  PlaceDraftPayload,
  SavePlaceDraftBody,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Place save-as-draft — the native echo of the web usePlaceUploadForm's
// saveDraft path + the DraftsView place tab. A draft's cover is uploaded
// from the device (kind "place_photo") before the payload is saved; the
// drafts list and the create wizard share the same drafts/place_drafts
// rows the web savePlaceDraft action writes. Mirrors useEventDrafts.ts.

const KEY = ["mobile", "organizer", "place-drafts"] as const;

export function usePlaceDrafts() {
  return useQuery({
    queryKey: [...KEY],
    queryFn: () => api.organizer.placeDrafts(),
    staleTime: 15_000,
  });
}

export function usePlaceDraft(draftId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, draftId],
    queryFn: () => api.organizer.placeDraft(draftId as string),
    enabled: !!draftId,
  });
}

export type SavePlaceDraftInput = {
  draftId?: string;
  payload: PlaceDraftPayload;
  expectedUpdatedAt?: string;
  /** A newly picked local cover URI to upload before saving, or null to
   *  leave the draft's current cover untouched. */
  coverUri?: string | null;
};

export function useSavePlaceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coverUri, ...rest }: SavePlaceDraftInput) => {
      const body: SavePlaceDraftBody = { ...rest };
      if (coverUri) {
        const up = await uploadToCloudinary(coverUri, "place_photo");
        body.coverPublicId = up.publicId;
        body.coverVersion = String(up.version);
      }
      return api.organizer.savePlaceDraft(body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY] }),
  });
}

export function useDeletePlaceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => api.organizer.deletePlaceDraft(draftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY] }),
  });
}
