import { logger } from "@abonten/core/logger";
import {
  type UploadedImage,
  uploadImageBuffer,
} from "@abonten/services/media/cloudinaryClient";
import { tr } from "../i18n/requestLocale";

export async function saveEventQrCodeToCloudinary(
  qrCodeBase64: string,
  filename: string,
): Promise<Partial<UploadedImage> & { error?: string }> {
  if (!qrCodeBase64) return { error: tr("noFileSelected") };

  try {
    const base64Data = qrCodeBase64.replace(/^data:image\/png;base64,/, "");
    return await uploadImageBuffer(Buffer.from(base64Data, "base64"), {
      folder: "tickets_qr_codes",
      publicId: filename,
      mime: "image/png",
    });
  } catch (error) {
    logger.error(`Cloudinary upload error: ${error}`);
    return { error: tr("uploadFailed") };
  }
}
