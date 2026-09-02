import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import type { PlaceCreateBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native echo of the web usePlaceUploadForm submit path: upload the cover
// photo straight to Cloudinary with a short-lived signature (kind
// "place_photo"), then POST the rest to /api/mobile/places, which runs the
// same postPlaceCore the web postPlace action runs. `clientRequestId` is
// generated once by the screen and reused across retries so a replay
// returns the same place instead of a duplicate.

export type CreatePlaceInput = Omit<
  PlaceCreateBody,
  "coverPublicId" | "coverVersion"
> & {
  /** Local file URI of a freshly picked (and cropped) cover photo — uploaded
   *  here. Omit and pass `coverPublicId` / `coverVersion` instead when
   *  publishing a resumed draft whose cover is already on Cloudinary. */
  coverUri?: string | null;
  coverPublicId?: string;
  coverVersion?: string;
};

export function useCreatePlace() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      coverUri,
      coverPublicId,
      coverVersion,
      ...rest
    }: CreatePlaceInput) => {
      let publicId = coverPublicId;
      let version = coverVersion;
      if (coverUri) {
        const up = await uploadToCloudinary(coverUri, "place_photo");
        publicId = up.publicId;
        version = String(up.version);
      }
      if (!publicId || !version) {
        throw new Error("A cover photo is required");
      }
      return api.places.create({
        ...rest,
        coverPublicId: publicId,
        coverVersion: version,
      });
    },
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["discovery", "places"] });
        qc.invalidateQueries({ queryKey: ["explore"] });
        qc.invalidateQueries({ queryKey: ["profile"] });
      }
    },
  });
}
