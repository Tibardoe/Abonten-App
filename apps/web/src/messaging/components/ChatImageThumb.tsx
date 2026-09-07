"use client";

import { useAttachmentUrl } from "@/messaging/hooks/useAttachmentUrl";
import { ImageIcon, Loader2 } from "lucide-react";

const MAX_W = 260;
const MAX_H = 340;

function fitted(w: number | null, h: number | null) {
  if (!w || !h) return { width: MAX_W, height: Math.round(MAX_W * 0.75) };
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// One image inside a bubble. `localUrl` (an optimistic, not-yet-confirmed
// send) renders straight away; otherwise the private storage path is signed
// on demand and cached. Click opens the full-size image in a new tab.
export function ChatImageThumb({
  storagePath,
  localUrl,
  width,
  height,
}: {
  storagePath?: string | null;
  localUrl?: string | null;
  width?: number | null;
  height?: number | null;
}) {
  const signed = useAttachmentUrl(localUrl ? null : storagePath);
  const url = localUrl ?? signed.data ?? null;
  const size = fitted(width ?? null, height ?? null);

  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-muted text-muted-foreground"
        style={size}
      >
        {signed.isError ? (
          <ImageIcon className="h-6 w-6" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin" />
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-lg"
    >
      {/* Signed one-off URLs aren't in next.config images.remotePatterns, and
          a blob: preview isn't an <Image> source — a plain <img> is right. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Shared attachment"
        width={size.width}
        height={size.height}
        className="h-auto max-w-full object-cover"
      />
    </a>
  );
}
