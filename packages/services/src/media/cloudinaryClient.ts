import { v2 as cloudinary } from "cloudinary";

// The one configured Cloudinary SDK instance for the server. Every module
// that talks to Cloudinary imports it from here instead of calling
// `cloudinary.config()` itself: the SDK's config is process-global, so the
// twelve copies of that block that used to exist were not twelve clients
// but twelve chances to drift (and one module, deleteEvent, relied on some
// other module having run first).
//
// `CLOUDINARY_API_TIMEOUT_MS` is passed as `timeout` on every Upload/Admin
// API call. The SDK's own default is 60 s per request; the calls this app
// makes (destroy, explicit, a small upload, one resource lookup) normally
// finish in well under a second, and a stalled request must not hold a
// Server Action or a queue route for a minute.

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const CLOUDINARY_API_TIMEOUT_MS = 15_000;

export { cloudinary };

type DestroyOptions = {
  resource_type?: "image" | "video" | "raw" | "auto";
  type?: string;
  invalidate?: boolean;
};

/**
 * `uploader.destroy` with the deadline applied. The SDK honours `timeout`
 * at runtime but its typings omit it, so the one cast lives here.
 */
export function destroyAsset(
  publicId: string,
  options: DestroyOptions = {},
): Promise<{ result?: string }> {
  return cloudinary.uploader.destroy(publicId, {
    ...options,
    timeout: CLOUDINARY_API_TIMEOUT_MS,
  } as DestroyOptions) as Promise<{ result?: string }>;
}
