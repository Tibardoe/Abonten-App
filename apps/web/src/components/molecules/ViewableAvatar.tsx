"use client";

import UserAvatar from "@/components/atoms/UserAvatar";
import ImageLightbox from "@/components/organisms/ImageLightbox";
import { useState } from "react";

type ViewableAvatarProps = {
  avatarUrl: string;
  fullImageUrl: string;
  width: number;
  height: number;
  alt: string;
  // False for the default/anonymous avatar — tapping a placeholder
  // shouldn't open an empty-feeling "photo" viewer.
  viewable?: boolean;
};

// Wraps UserAvatar with a tap/click-to-view-full-size interaction, reusing
// ImageLightbox. UserAvatar itself stays presentational-only (it's also
// used where a viewer wouldn't make sense — Header's nav avatar and
// HighlightViewer's small header avatars) — this wrapper is opt-in per
// call site instead of baked into UserAvatar.
export default function ViewableAvatar({
  avatarUrl,
  fullImageUrl,
  width,
  height,
  alt,
  viewable = true,
}: ViewableAvatarProps) {
  const [open, setOpen] = useState(false);

  if (!viewable) {
    return <UserAvatar avatarUrl={avatarUrl} width={width} height={height} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt}
        className="rounded-full shrink-0 transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <UserAvatar avatarUrl={avatarUrl} width={width} height={height} />
      </button>

      <ImageLightbox
        src={fullImageUrl}
        alt={alt}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
