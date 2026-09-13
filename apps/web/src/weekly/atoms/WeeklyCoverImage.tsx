"use client";

import Image, { type ImageProps } from "next/image";
import { type ReactNode, useState } from "react";

// A full-bleed cover photo that swaps itself for `fallback` if it fails to
// load, instead of showing the browser's broken-image icon.
export default function WeeklyCoverImage({
  fallback = null,
  ...props
}: Omit<ImageProps, "onError"> & { fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <Image {...props} alt={props.alt} onError={() => setFailed(true)} />;
}
