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

type CloudinaryResponse = {
  public_id: string;
  version: number;
  secure_url: string;
  resource_type: "image" | "video";
  duration?: number;
};

// XHR (not fetch) so the caller can show a real upload progress bar —
// `xhr.upload.onprogress` has no fetch equivalent in React Native. Resolves
// with the same shape whether or not `onProgress` is passed.
function postForm(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<CloudinaryResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const json =
          typeof xhr.response === "string"
            ? JSON.parse(xhr.response)
            : xhr.response;
        onProgress?.(1);
        resolve(json as CloudinaryResponse);
      } else {
        reject(new Error("The upload failed. Please try again."));
      }
    };
    xhr.onerror = () =>
      reject(new Error("The upload failed. Check your connection."));
    xhr.ontimeout = () => reject(new Error("The upload timed out."));

    xhr.send(form);
  });
}

export async function uploadToCloudinary(
  uri: string,
  kind: UploadSignatureKind,
  opts?: { video?: boolean; onProgress?: (fraction: number) => void },
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

  const json = await postForm(
    `https://api.cloudinary.com/v1_1/${cloud}/${isVideo ? "video" : "image"}/upload`,
    form,
    opts?.onProgress,
  );

  return {
    publicId: json.public_id,
    version: json.version,
    url: json.secure_url,
    resourceType: json.resource_type,
    duration: json.duration,
  };
}
