// A tiny, theme-neutral gray rect used as next/image's blurDataURL for
// remote (Cloudinary) images, which can't get an auto-generated blur since
// there's no build-time image-processing step in this repo. A flat data URI
// is enough to avoid the flyer popping in against an empty background --
// it's not a true derived-from-image blur, just a placeholder tone.
export const SHIMMER_BLUR_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23404040'/%3E%3C/svg%3E";
