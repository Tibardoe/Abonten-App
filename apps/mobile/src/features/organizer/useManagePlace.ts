import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type {
  PlaceOpeningHoursInput,
  SetPlaceStatusBody,
  UpdatePlaceBody,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Per-place management data + mutations — the context read prefills the
// edit forms (mobile echo of what manage/places/[placeId]/page.tsx fetches
// server-side); the three mutations mirror updatePlace /
// updatePlaceOpeningHours / setPlaceTemporaryStatus.

const KEY = ["mobile", "organizer", "place-manage"] as const;

export function usePlaceManageContext(placeId: string) {
  return useQuery({
    queryKey: [...KEY, placeId],
    queryFn: () => api.organizer.placeManageContext(placeId),
    enabled: !!placeId,
    staleTime: 20_000,
  });
}

function invalidate(
  qc: ReturnType<typeof useQueryClient>,
  placeId: string,
): void {
  qc.invalidateQueries({ queryKey: [...KEY, placeId] });
  qc.invalidateQueries({
    queryKey: ["mobile", "organizer", "places"],
  });
  qc.invalidateQueries({ queryKey: ["discovery", "places"] });
  qc.invalidateQueries({ queryKey: ["explore"] });
  qc.invalidateQueries({ queryKey: ["mobile", "place", placeId] });
}

export type UpdatePlaceInput = Omit<
  UpdatePlaceBody,
  "coverPublicId" | "coverVersion"
> & {
  placeId: string;
  /** Local URI of a newly picked cover, or null/undefined to keep current. */
  coverUri?: string | null;
};

export function useUpdatePlace(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      coverUri,
      placeId: id,
      ...rest
    }: UpdatePlaceInput) => {
      let coverPublicId: string | undefined;
      let coverVersion: string | undefined;
      if (coverUri) {
        const up = await uploadToCloudinary(coverUri, "place_photo");
        coverPublicId = up.publicId;
        coverVersion = String(up.version);
      }
      return api.organizer.updatePlace(id, {
        ...rest,
        ...(coverPublicId && coverVersion
          ? { coverPublicId, coverVersion }
          : {}),
      });
    },
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useUpdatePlaceHours(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (openingHours: PlaceOpeningHoursInput[]) =>
      api.organizer.updatePlaceHours(placeId, openingHours),
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useSetPlaceStatus(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetPlaceStatusBody) =>
      api.organizer.setPlaceStatus(placeId, body),
    onSuccess: () => invalidate(qc, placeId),
  });
}
