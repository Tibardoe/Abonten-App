import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The one full-screen media viewer for the mobile app: pinch-to-zoom + pan,
// double-tap to zoom, horizontal swipe between items, drag-down / drag-up
// to dismiss, safe-area-aware chrome, a loading spinner and a graceful
// "image unavailable" fallback. Review photo strips, place galleries and
// the single-image profile viewer all route through this so the behaviour
// is identical everywhere (issue #1 + parity).

export type MediaViewerItem = {
  id: string;
  /** Full-resolution URI to display. */
  uri: string;
  /** Optional low-res URI shown while `uri` loads. */
  thumbUri?: string;
};

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 130;
const DISMISS_VELOCITY = 900;

export function MediaViewer({
  items,
  index,
  open,
  onClose,
  onIndexChange,
}: {
  items: MediaViewerItem[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<MediaViewerItem>>(null);
  const [current, setCurrent] = useState(index);
  // Paging is frozen while the current page is pinch-zoomed so a pan moves
  // the image, not the pager.
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent(index);
      setZoomed(false);
    }
  }, [open, index]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== current) {
        setCurrent(next);
        onIndexChange?.(next);
      }
    },
    [current, width, onIndexChange],
  );

  if (!open || items.length === 0) return null;

  const safeIndex = Math.min(Math.max(index, 0), items.length - 1);

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={safeIndex}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => (
            <ZoomablePage
              item={item}
              width={width}
              height={height}
              onClose={onClose}
              onZoomChange={setZoomed}
            />
          )}
        />

        <View
          pointerEvents="box-none"
          style={[styles.chrome, { top: insets.top + 8 }]}
        >
          <View style={styles.counterPill}>
            <Icon name="images-outline" size={14} color="#fff" />
            {items.length > 1 ? (
              <Animated.Text style={styles.counterText}>
                {current + 1} / {items.length}
              </Animated.Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePage({
  item,
  width,
  height,
  onClose,
  onZoomChange,
}: {
  item: MediaViewerItem;
  width: number;
  height: number;
  onClose: () => void;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const dragY = useSharedValue(0);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reportZoom = useCallback(
    (z: boolean) => onZoomChange(z),
    [onZoomChange],
  );

  const resetZoom = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
    runOnJS(reportZoom)(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        resetZoom();
      } else {
        runOnJS(reportZoom)(true);
      }
    });

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onUpdate((e) => {
      if (scale.value > 1) {
        // Pan the zoomed image, bounded so it can't be flung far offscreen.
        const bound = ((scale.value - 1) * width) / 2 + 40;
        tx.value = Math.min(
          Math.max(savedTx.value + e.translationX, -bound),
          bound,
        );
        const vBound = ((scale.value - 1) * height) / 2 + 40;
        ty.value = Math.min(
          Math.max(savedTy.value + e.translationY, -vBound),
          vBound,
        );
      } else {
        // Not zoomed -> vertical drag dismiss.
        dragY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        return;
      }
      const dismiss =
        Math.abs(e.translationY) > DISMISS_DISTANCE ||
        Math.abs(e.velocityY) > DISMISS_VELOCITY;
      if (dismiss) {
        dragY.value = withTiming(
          e.translationY >= 0 ? height : -height,
          { duration: 180 },
          (done) => {
            if (done) runOnJS(onClose)();
          },
        );
      } else {
        dragY.value = withTiming(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(reportZoom)(true);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value <= 1) runOnJS(onClose)();
    });

  const composed = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value + dragY.value },
      { scale: scale.value },
    ],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(dragY.value) / (height * 0.7)),
  }));

  return (
    <View style={{ width, height }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, bgStyle]}
      />
      <GestureDetector gesture={composed}>
        <Animated.View style={{ flex: 1 }}>
          {failed ? (
            <View style={styles.fallback}>
              <Icon name="image-outline" size={40} color="#888" />
              <Animated.Text style={styles.fallbackText}>
                Image unavailable
              </Animated.Text>
            </View>
          ) : (
            <Animated.View style={[{ flex: 1 }, imageStyle]}>
              <Image
                source={{ uri: item.uri }}
                placeholder={item.thumbUri ? { uri: item.thumbUri } : undefined}
                style={{ width, height }}
                contentFit="contain"
                transition={150}
                onLoadStart={() => {
                  setLoading(true);
                  setFailed(false);
                }}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setFailed(true);
                }}
                accessibilityLabel="Full screen image"
              />
            </Animated.View>
          )}

          {loading && !failed ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  counterText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  closeBtn: {
    height: 38,
    width: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  loader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  fallbackText: { color: "#888", fontSize: 13 },
});
