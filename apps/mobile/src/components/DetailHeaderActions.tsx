import { FavoriteButton } from "@/components/FavoriteButton";
import { shareLink } from "@/lib/share";
import { Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The event / place detail header's right-side actions: report (when the
// viewer is a signed-in non-owner) + share + favourite, mirroring the web
// detail hero's control cluster. Sharing sends the https URL as text so the
// target app unfurls it into a rich preview card from the page's Open Graph
// tags (flyer / cover included there).
export function DetailHeaderActions({
  kind,
  id,
  shareTitle,
  shareUrl,
  onShared,
  onReport,
}: {
  kind: "event" | "place";
  id: string | undefined;
  shareTitle: string;
  shareUrl: string | null;
  /** Called after the share sheet reports a completed share. */
  onShared?: () => void;
  /** When set, a flag button is shown that opens the report sheet. */
  onReport?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-1">
      {onReport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Report this ${kind}`}
          hitSlop={8}
          onPress={onReport}
          className="p-1 active:opacity-70"
        >
          <Icon name="flag-outline" size={21} tone="foreground" />
        </Pressable>
      ) : null}
      {shareUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          hitSlop={8}
          onPress={() =>
            shareLink(shareTitle, shareUrl).then((shared) => {
              if (shared) onShared?.();
            })
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
