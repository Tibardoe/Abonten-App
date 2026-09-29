import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors, withAlpha } from "@abonten/ui-native/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Marker } from "./NativeMap";

// The social map's markers: a round photo in a white ring (the flyer or the
// place's cover); a mint halo that fades in around the selected one; and, for
// several pins close together, a small stack of photos with a count.
//
// HOW A MARKER IS DRAWN ON ANDROID — read before changing anything below.
// Google Maps shows a marker as a BITMAP: react-native-maps draws the
// <Marker>'s children into a bitmap the size of its FIRST child and hands it
// to the map. Measured on the emulator:
//
//  1. The first child must sit at (0,0) and be the marker's full size;
//     anything outside it is cut off. It is a plain frame marked
//     `collapsable={false}` so Fabric can't flatten it away (a layout-only
//     wrapper used to be flattened, which pushed the ring 5 dp right and down
//     and clipped it).
//  2. A photo only loads when the <Image> is a DIRECT child of the Marker —
//     react-native-maps starts Fresco by hand only for direct children, and
//     one level deeper every marker kept its placeholder. So the photo is a
//     sibling after the frame, laid absolutely over it.
//  3. Don't count on a drawn bitmap following later changes to its children.
//     A halo drawn inside the pin stayed up after deselecting, even with
//     `redraw()` called every second; a size or transform animation reached
//     the map only after it had ended. (Part of that was the marker-list bug
//     in useAppendOnlyOrder.ts, fixed since, but not all of it could be pinned
//     on it.) A photo arriving later does get drawn — react-native-maps
//     listens for that itself. So a marker's look never changes after it
//     mounts — a cluster whose count changes is a new marker (its key carries
//     the count) — and selection is a SEPARATE marker, the halo, drawn once
//     and faded with the marker's own `opacity` (the map's alpha, no redraw
//     needed), animated on the UI thread.
//
// iOS (Apple Maps) shows the same views live; the same design works there.

const ANDROID = Platform.OS === "android";
const RING = 3;
const PHOTO_D = 50;
// Room around the photo for its shadow.
const PHOTO_PAD = 5;
const PHOTO_FRAME = PHOTO_D + 2 * PHOTO_PAD;
// The halo: a mint ring this far out from the photo's edge.
const HALO_GAP = 7;
const HALO_D = PHOTO_D + 2 * HALO_GAP;
const HALO_FRAME = HALO_D + 2;
const HALO_IN_MS = 220;
const HALO_OUT_MS = 180;

const PHOTO_SHADOW = "0px 2px 5px rgba(0, 0, 0, 0.35)";
// The load callback can come before the image has reached its view; a
// couple of late redraws make sure the loaded photo is what gets drawn.
const LOADED_REDRAWS_MS = [0, 150, 600];

type Redrawable = { redraw: () => void };

function kindIcon(kind: "event" | "place"): IoniconName {
  return kind === "event" ? "ticket" : "storefront";
}

function useRedrawOnLoad() {
  // biome-ignore lint/suspicious/noExplicitAny: react-native-maps' Marker has no types through the NativeMap shim
  const ref = useRef<any>(null);
  const onLoad = useCallback(() => {
    if (!ANDROID) return;
    for (const ms of LOADED_REDRAWS_MS) {
      setTimeout(() => (ref.current as Redrawable | null)?.redraw(), ms);
    }
  }, []);
  return { ref, onLoad };
}

export function PhotoMarker({
  lat,
  lng,
  url,
  kind,
  raised,
  onPress,
}: {
  lat: number;
  lng: number;
  url: string | null;
  kind: "event" | "place";
  /** Drawn above the other pins (the selected one). */
  raised: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const { ref, onLoad } = useRedrawOnLoad();
  const [failed, setFailed] = useState(false);
  const hasPhoto = !!url && !failed;

  const photo = {
    position: "absolute" as const,
    top: PHOTO_PAD,
    left: PHOTO_PAD,
    width: PHOTO_D,
    height: PHOTO_D,
    borderRadius: PHOTO_D / 2,
    borderWidth: RING,
    borderColor: "#fff",
    backgroundColor: c.primary,
    boxShadow: PHOTO_SHADOW,
  };

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: lat, longitude: lng }}
      tracksViewChanges={false}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={raised ? 30 : 1}
    >
      <View
        collapsable={false}
        style={{ width: PHOTO_FRAME, height: PHOTO_FRAME }}
      />
      {hasPhoto ? (
        <Image
          source={{ uri: url }}
          fadeDuration={0}
          resizeMode="cover"
          style={photo}
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={[photo, { alignItems: "center", justifyContent: "center" }]}
        >
          <Icon
            name={kindIcon(kind)}
            size={22}
            color={c["primary-foreground"]}
          />
        </View>
      )}
    </Marker>
  );
}

const AnimatedMarker = Marker ? Animated.createAnimatedComponent(Marker) : null;

/**
 * The mint ring around the selected pin: its own marker just under the
 * photo, faded in on mount and out when `visible` turns false (then
 * `onHidden`, so the parent can drop it).
 */
export function SelectionHalo({
  id,
  lat,
  lng,
  visible,
  onHidden,
}: {
  id: string;
  lat: number;
  lng: number;
  visible: boolean;
  /** Stable: called with `id` once a hidden halo has faded out. */
  onHidden: (id: string) => void;
}) {
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = visible ? 1 : 0;
      if (!visible) onHidden(id);
      return;
    }
    opacity.value = visible
      ? withTiming(1, {
          duration: HALO_IN_MS,
          easing: Easing.out(Easing.cubic),
        })
      : withTiming(
          0,
          { duration: HALO_OUT_MS, easing: Easing.in(Easing.quad) },
          (finished) => {
            if (finished) runOnJS(onHidden)(id);
          },
        );
  }, [visible, reduceMotion, opacity, onHidden, id]);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));

  if (!AnimatedMarker) return null;
  return (
    <AnimatedMarker
      coordinate={{ latitude: lat, longitude: lng }}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={29}
      animatedProps={animatedProps}
    >
      <View
        collapsable={false}
        style={{ width: HALO_FRAME, height: HALO_FRAME }}
      >
        <View
          style={{
            position: "absolute",
            top: 1,
            left: 1,
            width: HALO_D,
            height: HALO_D,
            borderRadius: HALO_D / 2,
            borderWidth: 2.5,
            borderColor: c.primary,
            backgroundColor: withAlpha(c.primary, 0.22),
          }}
        />
      </View>
    </AnimatedMarker>
  );
}

// Several pins close together: the first photo on top of a second "photo"
// peeking out behind it, and the count in a badge. The photo sits in the
// middle of the frame so the marker's centre anchor lands on the cluster's
// point.
const CLUSTER_FRAME = 66;
const CLUSTER_D = 48;
const CLUSTER_INSET = (CLUSTER_FRAME - CLUSTER_D) / 2;

export function ClusterMarker({
  lat,
  lng,
  count,
  url,
  kind,
  onPress,
}: {
  lat: number;
  lng: number;
  count: number;
  url: string | null;
  kind: "event" | "place";
  onPress: () => void;
}) {
  const c = useThemeColors();
  const { ref, onLoad } = useRedrawOnLoad();
  const [failed, setFailed] = useState(false);
  const hasPhoto = !!url && !failed;

  const front = {
    position: "absolute" as const,
    top: CLUSTER_INSET,
    left: CLUSTER_INSET,
    width: CLUSTER_D,
    height: CLUSTER_D,
    borderRadius: CLUSTER_D / 2,
    borderWidth: RING,
    borderColor: "#fff",
    backgroundColor: c.primary,
    boxShadow: PHOTO_SHADOW,
  };

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: lat, longitude: lng }}
      tracksViewChanges={false}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={10}
    >
      <View
        collapsable={false}
        style={{ width: CLUSTER_FRAME, height: CLUSTER_FRAME }}
      >
        {/* The second photo, peeking out up and to the right. */}
        <View
          style={{
            position: "absolute",
            top: CLUSTER_INSET - 6,
            left: CLUSTER_INSET + 7,
            width: CLUSTER_D - 2,
            height: CLUSTER_D - 2,
            borderRadius: CLUSTER_D / 2,
            borderWidth: RING,
            borderColor: "#fff",
            backgroundColor: "#cfd5dc",
            boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.3)",
          }}
        />
      </View>
      {hasPhoto ? (
        <Image
          source={{ uri: url }}
          fadeDuration={0}
          resizeMode="cover"
          style={front}
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={[front, { alignItems: "center", justifyContent: "center" }]}
        >
          <Icon
            name={kindIcon(kind)}
            size={20}
            color={c["primary-foreground"]}
          />
        </View>
      )}
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          minWidth: 24,
          height: 24,
          paddingHorizontal: 6,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: "#fff",
          backgroundColor: c.foreground,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText
          style={{
            color: c.background,
            fontSize: 12,
            lineHeight: 15,
            fontWeight: "700",
          }}
        >
          {count > 99 ? "99+" : count}
        </AppText>
      </View>
    </Marker>
  );
}
