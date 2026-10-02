import { useTranslations } from "next-intl";
import Image from "next/image";

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
  const t = useTranslations("common");

  return (
    <div
      className="relative rounded-full overflow-hidden flex flex-shrink-0"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <Image
        src={avatarUrl}
        alt={t("userAvatar")}
        fill
        className="object-cover object-center"
        sizes={`${width}px`}
        priority
      />
    </div>
  );
}
