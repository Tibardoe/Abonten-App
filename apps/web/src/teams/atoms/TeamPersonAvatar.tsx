import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import Image from "next/image";

/** A team's or a member's photo (the default avatar when there is none). */
export default function TeamPersonAvatar({
  publicId,
  version,
  size = 40,
}: {
  publicId: string | null;
  version: string | null;
  size?: number;
}) {
  return (
    <Image
      src={buildAvatarUrl(publicId, version, {
        width: size * 2,
        height: size * 2,
      })}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
