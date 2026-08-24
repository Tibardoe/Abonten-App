"use server";

import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/utils/uploadLimits";
import { v2 as cloudinary } from "cloudinary";
import { saveToSupabase } from "./saveAvatarToSupabase";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function saveAvatarToCloudinary(selectedFile: File) {
  if (!selectedFile) return { error: "No file selected" };

  if (!selectedFile.type.startsWith("image/")) {
    return { error: "Only image files are allowed for profile pictures" };
  }

  // Defense-in-depth: the client already compresses and checks size before
  // calling this action, but a bypassed/malicious client shouldn't be able
  // to skip the check -- this keeps the server authoritative.
  if (selectedFile.size > MAX_AVATAR_UPLOAD_SIZE_BYTES) {
    return { error: "File is too large. Please upload an image under 5MB." };
  }

  try {
    const fileBuffer = Buffer.from(await selectedFile.arrayBuffer());

    const tempDir = os.tmpdir();
    const safeName = path.basename(selectedFile.name);
    const tempFilePath = path.join(tempDir, safeName);

    await writeFile(tempFilePath, fileBuffer);

    const result = await cloudinary.uploader.upload(tempFilePath, {
      folder: "user_profiles",
      resource_type: "image",
    });

    const transformation = `${result.width}, ${result.height}`;

    saveToSupabase(result.public_id, result.version, transformation);

    await unlink(tempFilePath);

    return { url: result.secure_url, public_id: result.public_id };
  } catch (error) {
    console.error(`Cloudinary upload error: ${error}`);
    return { error: "Upload failed" };
  }
}
