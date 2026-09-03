import { FavoriteButton } from "@/components/FavoriteButton";
import { shareLink, shareLinkWithImage } from "@/lib/share";
import { Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The event / place detail header's right-side actions: share + favourite,
// mirroring the web detail hero's control cluster. When the flyer/cover pair
// is passed, the share sheet carries the image too.
export function DetailHeaderActions({
  kind,
  id,
  shareTitle,
  shareUrl,
  imagePublicId,
  imageVersion,
}: {
  kind: "event" | "place";
  id: string | undefined;
  shareTitle: string;
  shareUrl: string | null;
  imagePublicId?: string | null;
  imageVersion?: string | null;
}) {
  return (
    <View className="flex-row items-center gap-1">
      {shareUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          hitSlop={8}
          onPress={() =>
            imagePublicId && imageVersion
              ? shareLinkWithImage(
                  shareTitle,
                  shareUrl,
                  imagePublicId,
                  imageVersion,
                )
              : shareLink(shareTitle, shareUrl)
          }
          className="p-1 active:opacity-70"
        >
          <Icon name="share-outline" size={22} tone="foreground" />
        </Pressable>
      ) : null}
      <FavoriteButton kind={kind} id={id} />
    </View>
  );
}
