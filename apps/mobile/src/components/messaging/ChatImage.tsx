import { useAttachmentUrl } from "@/features/messaging/useAttachmentUrl";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, View } from "react-native";

const MAX_W = 240;
const MAX_H = 320;

function fittedSize(
  w: number | null,
  h: number | null,
): {
  width: number;
  height: number;
} {
  if (!w || !h) return { width: MAX_W, height: MAX_W };
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// One image inside a bubble. `localUri` (an optimistic, not-yet-confirmed
// send) renders straight away; otherwise the private storage path is signed
// on demand and cached. Tap opens the full-screen viewer with the resolved
// URI.
export function ChatImage({
  storagePath,
  localUri,
  width,
  height,
  onPress,
}: {
  storagePath?: string | null;
  localUri?: string | null;
  width?: number | null;
  height?: number | null;
  onPress: (uri: string) => void;
}) {
  const signed = useAttachmentUrl(localUri ? null : storagePath);
  const uri = localUri ?? signed.data ?? null;
  const size = fittedSize(width ?? null, height ?? null);

  if (!uri) {
    return (
      <View
        className="items-center justify-center rounded-xl bg-muted"
        style={size}
      >
        {signed.isError ? (
          <Icon name="image-outline" size={22} tone="muted" />
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <Pressable onPress={() => onPress(uri)} accessibilityRole="imagebutton">
      <Image
        source={{ uri }}
        style={{ ...size, borderRadius: 12 }}
        contentFit="cover"
        transition={120}
      />
    </Pressable>
  );
}
