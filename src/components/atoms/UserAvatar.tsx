"use client";

import { CldImage } from "next-cloudinary";

type AvatarUrlProp = {
  avatarUrl: string;
};

export default function UserAvatar({ avatarUrl }: AvatarUrlProp) {
  return (
    <CldImage
      src={avatarUrl}
      alt="Profile picture"
      width={40}
      height={40}
      className="w-20 h-20 rounded-full"
    />
  );
}
