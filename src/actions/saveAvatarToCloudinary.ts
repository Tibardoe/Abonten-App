"use server";

import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  try {
    const fileBuffer = Buffer.from(await selectedFile.arrayBuffer());

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, selectedFile.name);

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
