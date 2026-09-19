import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@abonten/core/logger";
import {
  CLOUDINARY_API_TIMEOUT_MS,
  cloudinary,
} from "@abonten/services/media/cloudinaryClient";

export async function saveEventQrCodeToCloudinary(
  qrCodeBase64: string,
  filename: string,
) {
  if (!qrCodeBase64) return { error: "No file selected" };

  try {
    const base64Data = qrCodeBase64.replace(/^data:image\/png;base64,/, "");

    const buffer = Buffer.from(base64Data, "base64");

    const tempFilePath = path.join(os.tmpdir(), `${filename}.png`);

    await writeFile(tempFilePath, buffer);

    const result = await cloudinary.uploader.upload(tempFilePath, {
      timeout: CLOUDINARY_API_TIMEOUT_MS,
      folder: "tickets_qr_codes",
      public_id: filename,
      resource_type: "image",
    });

    const transformation = `${result.width}, ${result.height}`;

    await unlink(tempFilePath);

    return {
      public_id: result.public_id,
      version: result.version,
      transformation: transformation,
      secure_url: result.secure_url,
    };
  } catch (error) {
    logger.error(`Cloudinary upload error: ${error}`);
    return { error: "Upload failed" };
  }
}
