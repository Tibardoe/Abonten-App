import "server-only";

import { logger } from "@abonten/core/logger";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import {
  sniffImageMime,
  uploadImageBuffer,
} from "@abonten/services/media/cloudinaryClient";

// A place's cover photo (postPlace / updatePlace), same 5MB cap as event flyers. The multi-photo gallery uses the signed direct-upload path (getPlacePhotoUploadSignature.ts) instead.
// A plain server module, not a Server Action: it is only ever called by
// other actions after they have authenticated the caller, so it must not be
// an endpoint of its own.
export async function savePlacePhotoToCloudinary(selectedFile: File) {
  if (!selectedFile) return { error: "No file selected" };

  if (selectedFile.size > MAX_EVENT_FLYER_SIZE_BYTES) {
    return { error: "Image is too large. Maximum size is 5MB." };
  }

  try {
    const buffer = Buffer.from(await selectedFile.arrayBuffer());
    // The bytes decide, not the browser-supplied type.
    const mime = sniffImageMime(buffer);
    if (!mime) {
      return { error: "Only image files are allowed for place photos" };
    }
    const uploaded = await uploadImageBuffer(buffer, {
      folder: "place_photos",
      mime,
    });
    return {
      public_id: uploaded.public_id,
      version: uploaded.version,
      transformation: uploaded.transformation,
    };
  } catch (error) {
    logger.error(`Cloudinary upload error: ${error}`);
    return { error: "Upload failed" };
  }
}
