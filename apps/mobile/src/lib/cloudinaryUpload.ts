import { api } from "@/lib/api";
import type { UploadSignatureKind } from "@abonten/api-client";

// Shared "direct upload straight to Cloudinary with a short-lived server
// signature" path — the native echo of the web get*UploadSignature Server
// Actions + the browser->Cloudinary POST. The API secret never leaves the
// server; the signature binds the upload to `<prefix>/<user id>`.

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;

export type CloudinaryUpload = {
  publicId: string;
  version: number;
  url: string;
  resourceType: "image" | "video";
  duration?: number;
};

export async function uploadToCloudinary(
  uri: string,
  kind: UploadSignatureKind,
  opts?: { video?: boolean },
): Promise<CloudinaryUpload> {
  const sig = await api.uploads.signature(kind);
  if (sig.status !== 200 || !sig.data) {
    throw new Error(sig.message ?? "Could not authorize the upload.");
  }
  const { timestamp, signature, apiKey, cloudName, folder } = sig.data;
  const cloud = cloudName ?? CLOUD_NAME;
  if (!cloud) throw new Error("Cloudinary is not configured.");

  const isVideo = !!opts?.video;
  const form = new FormData();
  form.append("file", {
    uri,
    name: isVideo ? "upload.mp4" : "upload.jpg",
    type: isVideo ? "video/mp4" : "image/jpeg",
    // biome-ignore lint/suspicious/noExplicitAny: RN FormData file part
  } as any);
  form.append("api_key", String(apiKey ?? ""));
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/${isVideo ? "video" : "image"}/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error("The upload failed. Please try again.");
  const json = (await res.json()) as {
    public_id: string;
    version: number;
    secure_url: string;
    resource_type: "image" | "video";
    duration?: number;
  };
  return {
    publicId: json.public_id,
    version: json.version,
    url: json.secure_url,
    resourceType: json.resource_type,
    duration: json.duration,
  };
}
