import type { SpotlightTile } from "@abonten/core/content/profileContent";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, View } from "react-native";

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// One row of the profile's Spotlights grid: three 9:16 tiles edge to edge
// with a hairline gap, the way short-video profiles read. A short row keeps
// its tiles the width of a full row's.
export const SpotlightTileRow = memo(function SpotlightTileRow({
  tiles,
}: {
  tiles: SpotlightTile[];
}) {
  return (
    <View className="flex-row gap-0.5">
      {tiles.map((tile) => (
        <Tile key={tile.id} tile={tile} />
      ))}
      {Array.from({ length: 3 - tiles.length }, (_, i) => (
        <View key={`gap-${i.toString()}`} className="flex-1" />
      ))}
    </View>
  );
});

function Tile({ tile }: { tile: SpotlightTile }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(tile.href as never)}
      accessibilityRole="button"
      accessibilityLabel={`Spotlight, ${tile.views.toLocaleString()} views${tile.badge ? `, ${tile.badge}` : ""}`}
      className="flex-1 overflow-hidden bg-muted active:opacity-80"
      style={{ aspectRatio: 9 / 16 }}
    >
      {tile.thumbnailUrl ? (
        <Image
          source={{ uri: tile.thumbnailUrl }}
          style={{ flex: 1 }}
          contentFit="cover"
          recyclingKey={tile.id}
          transition={120}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Icon
            name={tile.isVideo ? "videocam-outline" : "image-outline"}
            size={24}
            tone="muted"
          />
        </View>
      )}
      {tile.badge ? (
        <View className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5">
          <AppText className="text-[10px] font-bold uppercase text-white">
            {tile.badge}
          </AppText>
        </View>
      ) : null}
      <View className="absolute bottom-1.5 left-1.5 flex-row items-center gap-0.5">
        <Icon name="play" size={12} color="#fff" />
        <AppText
          className="text-[12px] font-semibold text-white"
          style={{
            textShadowColor: "rgba(0,0,0,0.6)",
            textShadowRadius: 3,
            textShadowOffset: { width: 0, height: 1 },
          }}
        >
          {compact(tile.views)}
        </AppText>
      </View>
    </Pressable>
  );
}
