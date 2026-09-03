import type { CloudinaryDirectUploadResult } from "@abonten/types/highlightUploadType";

type UploadToCloudinaryParams = {
  file: File;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  /** Comma-separated allow-list from the signature — sent as `allowed_formats`. */
  allowedFormats: string;
  /** Byte ceiling from the signature — sent as `max_file_size`. */
  maxFileSizeBytes: number;
  resourceType: "image" | "video";
  onProgress?: (percent: number) => void;
};

// Uploads a file directly from the browser to Cloudinary, bypassing our
// server entirely -- the whole point being that a Server Action never sees
// these bytes (see uploadHighlight.ts). Built on XMLHttpRequest rather than
// fetch specifically because fetch has no upload-progress event; XHR does.
export function uploadToCloudinary({
  file,
  cloudName,
  apiKey,
  timestamp,
  signature,
  folder,
  allowedFormats,
  maxFileSizeBytes,
  resourceType,
  onProgress,
}: UploadToCloudinaryParams): {
  promise: Promise<CloudinaryDirectUploadResult>;
  xhr: XMLHttpRequest;
} {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<CloudinaryDirectUploadResult>(
    (resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      formData.append("folder", folder);
      // Signed params — must be echoed verbatim or Cloudinary rejects the
      // request; they also make Cloudinary enforce format + size server-side.
      formData.append("allowed_formats", allowedFormats);
      formData.append("max_file_size", String(maxFileSizeBytes));

      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        let parsed: unknown;

        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("Upload failed: invalid response from Cloudinary."));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as CloudinaryDirectUploadResult);
        } else {
          const message =
            (parsed as { error?: { message?: string } })?.error?.message ??
            "Upload failed.";
          reject(new Error(message));
        }
      };

      xhr.onerror = () =>
        reject(new Error("Upload failed. Please check your connection."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));

      xhr.send(formData);
    },
  );

  return { promise, xhr };
}
