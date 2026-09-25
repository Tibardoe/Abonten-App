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

export type UploadedImage = {
  public_id: string;
  version: number;
  transformation: string;
  secure_url: string;
};

/**
 * The raster formats accepted from people, recognised by their first bytes
 * rather than the browser-supplied MIME type (which the sender controls).
 * SVG is deliberately absent: it can carry script.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    buffer.length >= 6 &&
    /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))
  )
    return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("latin1") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand))
      return "image/heic";
    if (brand === "avif") return "image/avif";
  }
  return null;
}

/**
 * Uploads image bytes straight from memory. Never through a temp file: a
 * shared temp directory keyed by the client's file name let two
 * simultaneous uploads called "image.jpg" overwrite each other, so one
 * person's picture could be published as another's.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  options: { folder: string; publicId?: string; mime?: string },
): Promise<UploadedImage> {
  const mime = options.mime ?? sniffImageMime(buffer);
  if (!mime) throw new Error("Not a supported image");
  const result = await cloudinary.uploader.upload(
    `data:${mime};base64,${buffer.toString("base64")}`,
    {
      timeout: CLOUDINARY_API_TIMEOUT_MS,
      folder: options.folder,
      resource_type: "image",
      ...(options.publicId ? { public_id: options.publicId } : {}),
    },
  );
  return {
    public_id: result.public_id,
    version: result.version,
    transformation: `${result.width}, ${result.height}`,
    secure_url: result.secure_url,
  };
}
