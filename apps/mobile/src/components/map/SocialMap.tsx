import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { hapticLight, hapticSelection } from "@/lib/haptics";
import {
  AppText,
  EmptyState,
  Icon,
  PressableScale,
  Sheet,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useTheme } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SocialMapCard, type SocialMapItem } from "./SocialMapCard";
import { ClusterMarker, PhotoMarker, SelectionHalo } from "./SocialMapPins";
import {
  type Cluster,
  MIN_DELTA,
  type MapRegion,
  clusterize,
  gridLevel,
  latitudeScale,
  regionAround,
  spansOneSpot,
} from "./socialMapClusters";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from "./socialMapStyle";
import { useAppendOnlyOrder } from "./useAppendOnlyOrder";

export type { SocialMapItem, SocialMapLine } from "./SocialMapCard";

// A Snapchat-style social map (Abonten's own look): the event flyer / place
// cover IS the marker, a round photo in a white ring; pins close together
// become a small photo stack with a count that splits as you zoom in; tapping
// a pin fades a mint halo in around it and raises a card from the bottom that
// opens the detail screen. Every change animates both ways — the card leaves
// the way it came and the halo fades out. Falls back to the shared "map needs
// the latest app" message when the native Maps module / API key isn't in the
// binary.

const DEFAULT_CENTER = { lat: 5.6037, lng: -0.187 }; // Accra
const START_DELTA = 0.12;
const CARD_GAP = 12;
// Estimate until the card has been measured once.
const CARD_HEIGHT_GUESS = 150;
// Keep a focused pin at least this far inside the visible map.
const EDGE_MARGIN = 56;

function startRegion(
  center: { lat: number; lng: number } | null,
  fallback: SocialMapItem | undefined,
): MapRegion {
  return {
    latitude: center?.lat ?? fallback?.point.lat ?? DEFAULT_CENTER.lat,
    longitude: center?.lng ?? fallback?.point.lng ?? DEFAULT_CENTER.lng,
    latitudeDelta: START_DELTA,
    longitudeDelta: START_DELTA,
  };
}

/** Moved far enough from where it started that "back" is worth offering. */
function awayFrom(r: MapRegion, start: MapRegion): boolean {
  return (
    Math.abs(r.latitude - start.latitude) > start.latitudeDelta * 0.3 ||
    Math.abs(r.longitude - start.longitude) > start.longitudeDelta * 0.3 ||
    r.longitudeDelta > start.longitudeDelta * 2.5 ||
    r.longitudeDelta < start.longitudeDelta / 4
  );
}

// The list behind a cluster that shares one spot: every pin, tappable.
function StackedItemsSheet({
  items,
  onClose,
}: {
  items: SocialMapItem[] | null;
  onClose: () => void;
}) {
  const t = useTranslations("explore");

  const router = useRouter();
  const open = !!items && items.length > 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={items ? t("atThisSpot", { length: items.length }) : ""}
    >
      <View className="gap-2">
        {(items ?? []).map((item) => (
          <PressableScale
            key={item.id}
            accessibilityLabel={t("open", { title: item.title })}
            onPress={() => {
              onClose();
              router.push(
                item.kind === "event"
                  ? `/(app)/event/${item.id}`
                  : `/(app)/place/${item.id}`,
              );
            }}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <View className="h-14 w-14 overflow-hidden rounded-xl bg-muted">
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Icon
                    name={
                      item.kind === "event"
                        ? "ticket-outline"
                        : "storefront-outline"
                    }
                    size={18}
                    tone="muted"
                  />
                </View>
              )}
            </View>
            <View className="flex-1 gap-0.5">
              <AppText variant="bodyStrong" numberOfLines={1}>
                {item.title}
              </AppText>
              {item.lines.slice(0, 2).map((line) => (
                <AppText
                  key={`${line.icon}:${line.text}`}
                  variant="meta"
                  tone={line.tone === "success" ? "success" : "muted"}
                  numberOfLines={1}
                >
                  {line.text}
                </AppText>
              ))}
            </View>
            <Icon name="chevron-forward" size={18} tone="muted" />
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

export function SocialMap({
  items,
  center,
  emptyLabel: emptyLabelProp,
  bottomInset = 0,
}: {
  items: SocialMapItem[];
  center: { lat: number; lng: number } | null;
  emptyLabel?: string;
  /** Extra room under the card, when something overlaps the map's bottom. */
  bottomInset?: number;
}) {
  const t = useTranslations("explore");
  const emptyLabel = emptyLabelProp ?? t("nothingToMapHere");

  const { scheme } = useTheme();
  // biome-ignore lint/suspicious/noExplicitAny: react-native-maps ref has no types through the shim
  const mapRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The item on the card. It outlives the selection by the length of the
  // card's exit, so the card can slide away showing what it showed.
  const [cardItem, setCardItem] = useState<SocialMapItem | null>(null);
  // Items of a cluster that cannot be split by zooming (see MIN_DELTA).
  const [stackedItems, setStackedItems] = useState<SocialMapItem[] | null>(
    null,
  );
  // A marker press on Android also bubbles a MapView onPress right after —
  // without this guard the map's "tap empty space to dismiss" handler fires
  // immediately and the preview card never appears.
  const markerTapAt = useRef(0);
  const mapSize = useRef({ width: 0, height: 0 });
  const cardHeight = useRef(0);

  const withPoint = useMemo(
    () =>
      items.filter(
        (i) => Number.isFinite(i.point.lat) && Number.isFinite(i.point.lng),
      ),
    [items],
  );
  const selected = selectedId
    ? (withPoint.find((i) => i.id === selectedId) ?? null)
    : null;

  // The first item only matters when there is no centre, and is read once:
  // following every list change would move "start" under the person's feet.
  const firstItem = useRef(withPoint[0]);
  const centerLat = center?.lat;
  const centerLng = center?.lng;
  const start = useMemo(
    () =>
      startRegion(
        centerLat != null && centerLng != null
          ? { lat: centerLat, lng: centerLng }
          : null,
        firstItem.current,
      ),
    [centerLat, centerLng],
  );
  const region = useRef<MapRegion>(start);
  const [level, setLevel] = useState(() => gridLevel(start));
  const [away, setAway] = useState(false);

  const latScale = useMemo(() => latitudeScale(withPoint), [withPoint]);
  // The selected pin never disappears into a bubble.
  const clusters = useMemo(
    () => clusterize(withPoint, level, latScale, selectedId),
    [withPoint, level, latScale, selectedId],
  );

  // A new browsing area moves the map there (initialRegion only applies once).
  const firstStart = useRef(true);
  useEffect(() => {
    if (firstStart.current) {
      firstStart.current = false;
      return;
    }
    setSelectedId(null);
    mapRef.current?.animateToRegion(start, 450);
  }, [start]);

  // Bring a tapped pin clear of the card and the edges; leave the map
  // alone when it is already comfortably in view.
  const focusOn = useCallback(
    (item: SocialMapItem) => {
      const { width, height } = mapSize.current;
      const r = region.current;
      if (!width || !height) return;
      const x =
        ((item.point.lng - (r.longitude - r.longitudeDelta / 2)) /
          r.longitudeDelta) *
        width;
      const y =
        ((r.latitude + r.latitudeDelta / 2 - item.point.lat) /
          r.latitudeDelta) *
        height;
      const visibleBottom =
        height -
        (cardHeight.current || CARD_HEIGHT_GUESS) -
        CARD_GAP -
        bottomInset;
      const inView =
        x > EDGE_MARGIN &&
        x < width - EDGE_MARGIN &&
        y > EDGE_MARGIN &&
        y < visibleBottom - EDGE_MARGIN / 2;
      if (inView) return;
      // Centre it in the part of the map the card leaves visible.
      const targetY = visibleBottom / 2;
      mapRef.current?.animateCamera(
        {
          center: {
            latitude:
              item.point.lat +
              (targetY - height / 2) * (r.latitudeDelta / height),
            longitude: item.point.lng,
          },
        },
        { duration: 380 },
      );
    },
    [bottomInset],
  );

  const inAppendOrder = useAppendOnlyOrder();

  // Coming back to the map (from an event it opened, another tab) redraws
  // every marker from scratch. Android takes the map's views off the window
  // while it is hidden and puts its markers back on return, and they came
  // back wrong: the selected pin's photo was missing under its halo.
  const [generation, setGeneration] = useState(0);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) setGeneration((g) => g + 1);
      focusedOnce.current = true;
    }, []),
  );

  // Halos still fading out after their pin was deselected.
  const [leavingHalos, setLeavingHalos] = useState<SocialMapItem[]>([]);
  const letHaloGo = useCallback((item: SocialMapItem | null) => {
    if (!item) return;
    setLeavingHalos((list) =>
      list.some((h) => h.id === item.id) ? list : [...list, item],
    );
  }, []);
  const dropHalo = useCallback((id: string) => {
    setLeavingHalos((list) => list.filter((h) => h.id !== id));
  }, []);

  const select = useCallback(
    (item: SocialMapItem) => {
      markerTapAt.current = Date.now();
      if (item.id === selectedId) return;
      hapticSelection();
      letHaloGo(selected);
      setLeavingHalos((list) => list.filter((h) => h.id !== item.id));
      setSelectedId(item.id);
      setCardItem(item);
      focusOn(item);
    },
    [selectedId, selected, letHaloGo, focusOn],
  );

  const deselect = useCallback(() => {
    if (!selectedId) return;
    letHaloGo(selected);
    setSelectedId(null);
  }, [selectedId, selected, letHaloGo]);

  const onCardExited = useCallback(() => setCardItem(null), []);
  const onCardHeight = useCallback((h: number) => {
    cardHeight.current = h;
  }, []);

  const recenterOpacity = useSharedValue(0);
  useEffect(() => {
    recenterOpacity.value = withTiming(away ? 1 : 0, { duration: 180 });
  }, [away, recenterOpacity]);
  const recenterStyle = useAnimatedStyle(() => ({
    opacity: recenterOpacity.value,
    transform: [{ scale: 0.85 + recenterOpacity.value * 0.15 }],
  }));

  if (!MapConfigured || !MapView || !Marker) {
    return (
      <EmptyState
        icon="map-outline"
        title={t("mapNeedsTheLatestApp")}
        description={t("updateAbontenOrRebuildTheDev")}
      />
    );
  }

  if (withPoint.length === 0) {
    return (
      <EmptyState
        icon="map-outline"
        title={emptyLabel}
        description={t("switchBackToTheListOr")}
      />
    );
  }

  function openCluster(
    cl: Extract<Cluster<SocialMapItem>, { kind: "cluster" }>,
  ) {
    markerTapAt.current = Date.now();
    hapticLight();
    deselect();
    if (
      region.current.latitudeDelta <= MIN_DELTA * 1.05 ||
      spansOneSpot(cl.items)
    ) {
      setStackedItems(cl.items);
      return;
    }
    mapRef.current?.animateToRegion(regionAround(cl.items), 400);
  }

  const android = Platform.OS === "android";

  return (
    <MapErrorBoundary>
      <View
        style={{ flex: 1, overflow: "hidden" }}
        onLayout={(e) => {
          mapSize.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
      >
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          provider={android ? PROVIDER_GOOGLE : undefined}
          initialRegion={start}
          customMapStyle={
            android
              ? scheme === "dark"
                ? DARK_MAP_STYLE
                : LIGHT_MAP_STYLE
              : undefined
          }
          {...(android
            ? {}
            : { userInterfaceStyle: scheme, showsPointsOfInterests: false })}
          // Pins are photos and the card is ours: no Google camera jump or
          // "Directions / Open in Maps" toolbar on tap, and a plain north-up
          // map (the focus maths above assumes one).
          moveOnMarkerPress={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          onRegionChangeComplete={(r: MapRegion) => {
            region.current = r;
            setLevel(gridLevel(r));
            setAway(awayFrom(r, start));
          }}
          onPress={() => {
            // Ignore the onPress that immediately follows a marker tap.
            if (Date.now() - markerTapAt.current < 350) return;
            deselect();
          }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {inAppendOrder([
            ...clusters.map((cl) =>
              cl.kind === "point" ? (
                <PhotoMarker
                  key={`${generation}:${cl.key}`}
                  lat={cl.lat}
                  lng={cl.lng}
                  url={cl.item.imageUrl}
                  kind={cl.item.kind}
                  raised={cl.item.id === selectedId}
                  onPress={() => select(cl.item)}
                />
              ) : (
                <ClusterMarker
                  // A marker's look is fixed once drawn (SocialMapPins rule
                  // 3), so a new count is a new marker.
                  key={`${generation}:${cl.key}:${cl.count}`}
                  lat={cl.lat}
                  lng={cl.lng}
                  count={cl.count}
                  url={cl.items.find((i) => i.imageUrl)?.imageUrl ?? null}
                  kind={cl.items[0].kind}
                  onPress={() => openCluster(cl)}
                />
              ),
            ),
            // The selected pin's halo, and any still fading out.
            ...[
              ...leavingHalos.filter((h) => h.id !== selectedId),
              ...(selected ? [selected] : []),
            ].map((h) => (
              <SelectionHalo
                key={`${generation}:halo:${h.id}`}
                id={h.id}
                lat={h.point.lat}
                lng={h.point.lng}
                visible={h.id === selectedId}
                onHidden={dropHalo}
              />
            )),
          ])}
        </MapView>

        <Animated.View
          pointerEvents={away ? "auto" : "none"}
          style={[{ position: "absolute", top: 12, right: 12 }, recenterStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("backToTheAreaYouRe")}
            onPress={() => {
              hapticLight();
              mapRef.current?.animateToRegion(start, 450);
            }}
            className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-80"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.16,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 5,
            }}
          >
            <Icon name="locate" size={20} tone="foreground" />
          </Pressable>
        </Animated.View>

        <SocialMapCard
          item={selected ?? cardItem}
          open={!!selected}
          bottom={CARD_GAP + bottomInset}
          onRequestClose={deselect}
          onExited={onCardExited}
          onHeight={onCardHeight}
        />

        <StackedItemsSheet
          items={stackedItems}
          onClose={() => setStackedItems(null)}
        />
      </View>
    </MapErrorBoundary>
  );
}
