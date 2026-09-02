import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { AppText, EmptyState, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// react-native's Image (not expo-image) inside a <Marker> child: the native
// map rasterises the marker view to a bitmap, and RN Image is the reliable
// source for that snapshot on Android — an expo-image often snapshots empty,
// which is why photo markers were falling back to the default red pin.
import { Platform, Pressable, Image as RNImage, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A Snapchat-style social map (Abonten's own look): the event flyer / place
// cover IS the marker, rendered as a circular photo with a ring + shadow;
// nearby markers collapse into a count bubble that splits as you zoom in;
// tapping a marker raises a preview card from the bottom that opens the
// detail screen. Falls back to the shared "map needs the latest app"
// message when the native Maps module / API key isn't in the binary.

export type SocialMapItem = {
  id: string;
  kind: "event" | "place";
  title: string;
  imageUrl: string | null;
  point: { lat: number; lng: number };
  /** Pre-formatted preview lines, most-important first (max ~3 shown). */
  lines: string[];
  /** Small trailing tag, e.g. a price or "Open". */
  tag?: string | null;
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Cluster =
  | { kind: "point"; item: SocialMapItem; lat: number; lng: number }
  | {
      kind: "cluster";
      count: number;
      lat: number;
      lng: number;
      items: SocialMapItem[];
    };

const GRID = 5; // cells per axis — bounds rendered markers to <=25

function clusterize(items: SocialMapItem[], region: Region): Cluster[] {
  if (items.length <= 1) {
    return items.map((item) => ({
      kind: "point" as const,
      item,
      lat: item.point.lat,
      lng: item.point.lng,
    }));
  }
  const cellLat = region.latitudeDelta / GRID;
  const cellLng = region.longitudeDelta / GRID;
  const buckets = new Map<string, SocialMapItem[]>();
  for (const item of items) {
    const gx = Math.round(item.point.lng / cellLng);
    const gy = Math.round(item.point.lat / cellLat);
    const key = `${gx}:${gy}`;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  const out: Cluster[] = [];
  for (const list of buckets.values()) {
    if (list.length === 1) {
      const item = list[0];
      out.push({
        kind: "point",
        item,
        lat: item.point.lat,
        lng: item.point.lng,
      });
    } else {
      const lat = list.reduce((s, i) => s + i.point.lat, 0) / list.length;
      const lng = list.reduce((s, i) => s + i.point.lng, 0) / list.length;
      out.push({ kind: "cluster", count: list.length, lat, lng, items: list });
    }
  }
  return out;
}

function PhotoMarker({
  url,
  kind,
  selected,
  onImageLoad,
}: {
  url: string | null;
  kind: "event" | "place";
  selected: boolean;
  onImageLoad?: () => void;
}) {
  const c = useThemeColors();
  const size = selected ? 56 : 44;
  return (
    <View
      style={{
        width: size + 10,
        height: size + 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: selected ? c.primary : "#fff",
          backgroundColor: selected ? c.primary : c.card,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        {url ? (
          <RNImage
            source={{ uri: url }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onLoad={onImageLoad}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.primary,
            }}
          >
            <Icon
              name={kind === "event" ? "ticket" : "location"}
              size={20}
              color="#fff"
            />
          </View>
        )}
      </View>
    </View>
  );
}

function ClusterMarker({ count }: { count: number }) {
  const c = useThemeColors();
  return (
    <View
      style={{
        minWidth: 40,
        height: 40,
        paddingHorizontal: 8,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: "#fff",
        backgroundColor: c.primary,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 5,
      }}
    >
      <AppText
        style={{
          color: c["primary-foreground"],
          fontWeight: "800",
          fontSize: 15,
        }}
      >
        {count > 99 ? "99+" : count}
      </AppText>
    </View>
  );
}

function PreviewCard({
  item,
  onClose,
  bottomInset,
}: {
  item: SocialMapItem;
  onClose: () => void;
  bottomInset: number;
}) {
  const router = useRouter();
  const ty = useSharedValue(240);

  useEffect(() => {
    ty.value = withTiming(0, { duration: 220 });
  }, [ty]);

  const close = useCallback(() => {
    ty.value = withTiming(240, { duration: 180 }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [onClose, ty]);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 700) {
        ty.value = withTiming(240, { duration: 160 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else {
        ty.value = withTiming(0, { duration: 160 });
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: bottomInset + 12,
        },
        style,
      ]}
    >
      <GestureDetector gesture={pan}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
          onPress={() =>
            router.push(
              item.kind === "event"
                ? `/(app)/event/${item.id}`
                : `/(app)/place/${item.id}`,
            )
          }
          className="flex-row gap-3 rounded-2xl border border-border bg-card p-3"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <View className="h-[72px] w-[72px] overflow-hidden rounded-xl bg-muted">
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Icon name="image-outline" size={20} tone="muted" />
              </View>
            )}
          </View>

          <View className="flex-1 justify-center gap-0.5">
            <AppText variant="bodyStrong" numberOfLines={1}>
              {item.title}
            </AppText>
            {item.lines.slice(0, 3).map((line, i) => (
              <AppText
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed preview lines
                key={i}
                variant={i === 0 ? "metaStrong" : "meta"}
                numberOfLines={1}
              >
                {line}
              </AppText>
            ))}
          </View>

          <View className="items-end justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={10}
              onPress={close}
            >
              <Icon name="close" size={18} tone="muted" />
            </Pressable>
            {item.tag ? (
              <View className="rounded-full bg-muted px-2 py-0.5">
                <AppText variant="caption" className="font-semibold">
                  {item.tag}
                </AppText>
              </View>
            ) : (
              <Icon name="chevron-forward" size={18} tone="muted" />
            )}
          </View>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

export function SocialMap({
  items,
  center,
  emptyLabel = "Nothing to map here",
}: {
  items: SocialMapItem[];
  center: { lat: number; lng: number } | null;
  emptyLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  // biome-ignore lint/suspicious/noExplicitAny: react-native-maps ref has no types through the shim
  const mapRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A marker press on Android also bubbles a MapView onPress right after —
  // without this guard the map's "tap empty space to dismiss" handler fires
  // immediately and the preview card never appears.
  const markerTapAt = useRef(0);
  // Which photo markers have finished loading their image — once loaded a
  // marker no longer needs re-rasterising, so tracksViewChanges can go off.
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const markLoaded = useCallback((id: string) => {
    setLoaded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const withPoint = useMemo(
    () => items.filter((i) => Number.isFinite(i.point.lat)),
    [items],
  );

  const initialRegion = useMemo<Region>(() => {
    const lat = center?.lat ?? withPoint[0]?.point.lat ?? 5.6037;
    const lng = center?.lng ?? withPoint[0]?.point.lng ?? -0.187;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }, [center, withPoint]);

  const [region, setRegion] = useState<Region>(initialRegion);

  const clusters = useMemo(
    () => clusterize(withPoint, region),
    [withPoint, region],
  );
  const selected = withPoint.find((i) => i.id === selectedId) ?? null;

  if (!MapConfigured || !MapView || !Marker) {
    return (
      <EmptyState
        icon="map-outline"
        title="Map needs the latest app"
        description="Update Abonten (or rebuild the dev client with the Google Maps key) to use the map view."
      />
    );
  }

  if (withPoint.length === 0) {
    return (
      <EmptyState
        icon="map-outline"
        title={emptyLabel}
        description="Switch back to the list, or widen your filters."
      />
    );
  }

  function zoomInto(lat: number, lng: number) {
    setSelectedId(null);
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: Math.max(region.latitudeDelta / 2.5, 0.01),
        longitudeDelta: Math.max(region.longitudeDelta / 2.5, 0.01),
      },
      280,
    );
  }

  return (
    <MapErrorBoundary>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          onRegionChangeComplete={(r: Region) => setRegion(r)}
          onPress={() => {
            // Ignore the onPress that immediately follows a marker tap.
            if (Date.now() - markerTapAt.current < 350) return;
            setSelectedId(null);
          }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {clusters.map((cl) =>
            cl.kind === "point" ? (
              <Marker
                key={cl.item.id}
                coordinate={{ latitude: cl.lat, longitude: cl.lng }}
                // Keep re-rasterising until the photo has loaded (or forever
                // if there's no photo — the fallback view is cheap). A
                // selected marker also re-tracks so its ring updates.
                tracksViewChanges={
                  !loaded.has(cl.item.id) || cl.item.id === selectedId
                }
                onPress={() => {
                  markerTapAt.current = Date.now();
                  setSelectedId(cl.item.id);
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <PhotoMarker
                  url={cl.item.imageUrl}
                  kind={cl.item.kind}
                  selected={cl.item.id === selectedId}
                  onImageLoad={() => markLoaded(cl.item.id)}
                />
              </Marker>
            ) : (
              <Marker
                key={`c:${cl.lat.toFixed(4)}:${cl.lng.toFixed(4)}:${cl.count}`}
                coordinate={{ latitude: cl.lat, longitude: cl.lng }}
                tracksViewChanges={false}
                onPress={() => {
                  markerTapAt.current = Date.now();
                  zoomInto(cl.lat, cl.lng);
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <ClusterMarker count={cl.count} />
              </Marker>
            ),
          )}
        </MapView>

        {selected ? (
          <PreviewCard
            key={selected.id}
            item={selected}
            onClose={() => setSelectedId(null)}
            bottomInset={insets.bottom}
          />
        ) : null}
      </View>
    </MapErrorBoundary>
  );
}
