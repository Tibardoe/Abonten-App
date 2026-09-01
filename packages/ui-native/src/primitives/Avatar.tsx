import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { Image } from "expo-image";
import { View } from "react-native";

// Cloudinary avatar with the same anonymous fallback the web app uses
// (Header.tsx / ProfileDetails.tsx). `size` is the rendered diameter.

const DEFAULT_PUBLIC_ID = "AnonymousProfile_rn6qez";
const DEFAULT_VERSION = "1743533914";

export type AvatarProps = {
  publicId?: string | null;
  version?: string | number | null;
  size?: number;
  className?: string;
};

export function Avatar({
  publicId,
  version,
  size = 40,
  className,
}: AvatarProps) {
  const id = publicId || DEFAULT_PUBLIC_ID;
  const v = publicId ? String(version ?? "") : DEFAULT_VERSION;
  const uri = buildCloudinaryUrl(id, v, { width: size * 2, height: size * 2 });

  return (
    <View
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit="cover"
        transition={120}
      />
    </View>
  );
}
