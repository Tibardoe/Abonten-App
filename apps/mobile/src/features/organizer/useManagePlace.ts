import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type {
  AddPlaceServiceBody,
  PlaceOpeningHoursInput,
  SetPlaceStatusBody,
  UpdatePlaceBody,
  UpdatePlaceServiceBody,
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

export function useAddPlaceService(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPlaceServiceBody) =>
      api.organizer.addPlaceService(placeId, body),
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useUpdatePlaceService(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { serviceId: string; body: UpdatePlaceServiceBody }) =>
      api.organizer.updatePlaceService(placeId, v.serviceId, v.body),
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useRemovePlaceService(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      api.organizer.removePlaceService(placeId, serviceId),
    onSuccess: () => invalidate(qc, placeId),
  });
}

// Uploads one picked photo straight to Cloudinary (kind "place_photo"),
// then records it. The screen calls this per picked asset.
export function useAddPlacePhoto(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uri: string) => {
      const up = await uploadToCloudinary(uri, "place_photo");
      return api.organizer.addPlacePhoto(placeId, {
        publicId: up.publicId,
        version: String(up.version),
      });
    },
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useReorderPlacePhotos(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoIds: string[]) =>
      api.organizer.reorderPlacePhotos(placeId, photoIds),
    onSuccess: () => invalidate(qc, placeId),
  });
}

export function useRemovePlacePhoto(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) =>
      api.organizer.removePlacePhoto(placeId, photoId),
    onSuccess: () => invalidate(qc, placeId),
  });
}

// Promote a gallery photo to the place cover (place.cover_public_id/version).
export function useSetPlaceCover(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) =>
      api.organizer.setPlaceCover(placeId, photoId),
    onSuccess: () => invalidate(qc, placeId),
  });
}
