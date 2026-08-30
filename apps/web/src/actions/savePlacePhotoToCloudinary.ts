"use server";

import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@abonten/core/logger";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Mirrors saveEventFlyerToCloudinary.ts — this is the shared chokepoint for
// a place's cover photo (a raw File argument to a Server Action), reusing
// the same 5MB cap as event flyers since it's the same kind of marketing
// image. The multi-photo gallery uses the separate signed direct-upload
// path (getPlacePhotoUploadSignature.ts) instead, to avoid the Server
// Action body size limit for multiple files.
export async function savePlacePhotoToCloudinary(selectedFile: File) {
  if (!selectedFile) return { error: "No file selected" };

  if (!selectedFile.type.startsWith("image/")) {
    return { error: "Only image files are allowed for place photos" };
  }

  if (selectedFile.size > MAX_EVENT_FLYER_SIZE_BYTES) {
    return { error: "Image is too large. Maximum size is 5MB." };
  }

  try {
    const fileBuffer = Buffer.from(await selectedFile.arrayBuffer());

    const tempDir = os.tmpdir();
    const safeName = path.basename(selectedFile.name);
    const tempFilePath = path.join(tempDir, safeName);

    await writeFile(tempFilePath, fileBuffer);

    const result = await cloudinary.uploader.upload(tempFilePath, {
      folder: "place_photos",
      resource_type: "image",
    });

    const transformation = `${result.width}, ${result.height}`;

    await unlink(tempFilePath);

    return {
      public_id: result.public_id,
      version: result.version,
      transformation: transformation,
    };
  } catch (error) {
    logger.error(`Cloudinary upload error: ${error}`);
    return { error: "Upload failed" };
  }
}
