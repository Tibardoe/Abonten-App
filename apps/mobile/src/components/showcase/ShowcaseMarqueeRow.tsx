import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import { Overline } from "@abonten/ui-native";
import { useEffect, useRef, useState } from "react";
import { FlatList, type LayoutChangeEvent, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { SHOWCASE_TILE_WIDTH, ShowcaseTile } from "./ShowcaseTile";

// One row of the "On Abonten" wall, drifting slowly sideways.
//
// The track holds the row twice and slides by exactly one copy's width per
// loop, so the second copy takes the first one's place without a seam. The
// slide is a translateX moved by a Reanimated frame callback, which runs on
// the UI thread: no JavaScript runs per frame, and the JS thread stays free
// on low-end Android. A short row is repeated inside each copy until the
// copy is wider than the screen. Only the first set is read by a screen
// reader; every repeat is hidden from it.
//
// It stops while a finger is on it (and a moment after), when `moving` is
// false (the screen is not in front, the app is in the background), and it
// is a plain sideways list that never moves by itself when `still` (reduced
// motion or a screen reader).

const MIN_TILES_PER_COPY = 6;
const GAP = 12;
/** Points per second: a slow drift. */
const SPEED = 28;
const TOUCH_GRACE_MS = 2500;

function Copy({
  tiles,
  copies,
  hidden,
  now,
  onLayout,
}: {
  tiles: Tile[];
  copies: number;
  hidden: boolean;
  now: Date;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const repeats = Array.from({ length: copies - 1 }, (_, i) => i + 1);
  return (
    <View
      onLayout={onLayout}
      className="flex-row"
      style={{ gap: GAP, paddingRight: GAP }}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      {tiles.map((tile) => (
        <ShowcaseTile key={tile.entryId} tile={tile} now={now} />
      ))}
      {repeats.length > 0 ? (
        <View
          className="flex-row"
          style={{ gap: GAP }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {repeats.flatMap((copy) =>
            tiles.map((tile) => (
              <ShowcaseTile
                key={`${copy}-${tile.entryId}`}
                tile={tile}
                now={now}
              />
            )),
          )}
        </View>
      ) : null}
    </View>
  );
}

export function ShowcaseMarqueeRow({
  title,
  tiles,
  reverse = false,
  moving,
  still,
  now,
}: {
  title: string;
  tiles: Tile[];
  /** Drift the other way (the second row). */
  reverse?: boolean;
  /** The screen is in front and the app is active. */
  moving: boolean;
  /** Reduced motion or a screen reader: a plain sideways list. */
  still: boolean;
  now: Date;
}) {
  const [copyWidth, setCopyWidth] = useState(0);
  const [touched, setTouched] = useState(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useSharedValue(0);
  const offset = useSharedValue(0);
  const direction = reverse ? 1 : -1;

  const frame = useFrameCallback((info) => {
    "worklet";
    const w = width.value;
    if (w <= 0) return;
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    let x = offset.value + direction * SPEED * Math.min(dt, 0.1);
    // Keep x in (-w, 0]: one copy's width either way is the same picture.
    if (x <= -w) x += w;
    if (x > 0) x -= w;
    offset.value = x;
  }, false);

  const active = moving && !still && !touched && copyWidth > 0;
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  if (tiles.length === 0) return null;

  const header = <Overline className="px-4">{title}</Overline>;

  if (still) {
    return (
      <View className="gap-2 pt-4">
        {header}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tiles}
          keyExtractor={(tile) => tile.entryId}
          contentContainerStyle={{ gap: GAP, paddingHorizontal: 16 }}
          renderItem={({ item }) => <ShowcaseTile tile={item} now={now} />}
        />
      </View>
    );
  }

  const copies = Math.max(1, Math.ceil(MIN_TILES_PER_COPY / tiles.length));
  const onCopyLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w <= 0 || Math.abs(w - width.value) < 0.5) return;
    width.value = w;
    // The reverse row starts one copy to the left, so it fills the screen
    // as it moves right.
    offset.value = reverse ? -w : 0;
    setCopyWidth(w);
  };

  const hold = () => {
    if (release.current) clearTimeout(release.current);
    setTouched(true);
  };
  const letGo = () => {
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => setTouched(false), TOUCH_GRACE_MS);
  };

  return (
    <View className="gap-2 pt-4">
      {header}
      <View
        className="overflow-hidden"
        onTouchStart={hold}
        onTouchEnd={letGo}
        onTouchCancel={letGo}
      >
        <Animated.View
          className="flex-row"
          style={[
            {
              width:
                (SHOWCASE_TILE_WIDTH + GAP) * tiles.length * copies * 2 + 32,
            },
            style,
          ]}
        >
          <View style={{ width: 16 }} />
          <Copy
            tiles={tiles}
            copies={copies}
            hidden={false}
            now={now}
            onLayout={onCopyLayout}
          />
          <Copy tiles={tiles} copies={copies} hidden now={now} />
        </Animated.View>
      </View>
    </View>
  );
}
