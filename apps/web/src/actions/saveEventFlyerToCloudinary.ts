import "server-only";

import { logger } from "@abonten/core/logger";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  sniffImageMime,
  uploadImageBuffer,
} from "@abonten/services/media/cloudinaryClient";

// Mirrors the flyer rules for every caller — postEvent and updateEvent.
// A plain server module, not a Server Action: it is only ever called by
// other actions after they have authenticated the caller, so it must not be
// an endpoint of its own.
export async function saveEventFlyerToCloudinary(selectedFile: File) {
  if (!selectedFile) return { error: tr("noFileSelected") };

  if (selectedFile.size > MAX_EVENT_FLYER_SIZE_BYTES) {
    return { error: tr("imageIsTooLargeMaximumSize") };
  }

  try {
    const buffer = Buffer.from(await selectedFile.arrayBuffer());
    // The bytes decide, not the browser-supplied type.
    const mime = sniffImageMime(buffer);
    if (!mime) {
      return { error: tr("onlyImageFilesAreAllowedFor") };
    }
    const uploaded = await uploadImageBuffer(buffer, {
      folder: "event_flyers",
      mime,
    });
    return {
      public_id: uploaded.public_id,
      version: uploaded.version,
      transformation: uploaded.transformation,
    };
  } catch (error) {
    logger.error(`Cloudinary upload error: ${error}`);
    return { error: tr("uploadFailed") };
  }
}
