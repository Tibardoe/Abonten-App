"use server";

import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

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
    console.error(`Cloudinary upload error: ${error}`);
    return { error: "Upload failed" };
  }
}
