"use client";

import { CldImage } from "next-cloudinary";

type AvatarUrlProp = {
  avatarUrl: string;
  width: number;
  height: number;
};

export default function UserAvatar({
  avatarUrl,
  width,
  height,
}: AvatarUrlProp) {
  return (
    <CldImage
      src={avatarUrl}
      alt="Profile picture"
      width={width}
      height={height}
      className="rounded-full"
    />
  );
}
