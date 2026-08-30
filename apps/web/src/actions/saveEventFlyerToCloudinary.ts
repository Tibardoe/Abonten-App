"use server";

import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@/utils/logger";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function saveEventFlyerToCloudinary(selectedFile: File) {
  if (!selectedFile) return { error: "No file selected" };

  if (!selectedFile.type.startsWith("image/")) {
    return { error: "Only image files are allowed for event flyers" };
  }

  // Defense-in-depth: postEvent.ts/updateEvent.ts/saveEventDraft.ts's
  // callers already reject an oversized flyer client-side before it's ever
  // selected (see useImageSelection.ts / useEventEditForm.ts), but this
  // action is the one shared chokepoint for every caller, present and
  // future.
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
      folder: "event_flyers",
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
