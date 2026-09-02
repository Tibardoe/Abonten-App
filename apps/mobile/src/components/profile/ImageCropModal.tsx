import { hapticLight } from "@/lib/haptics";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { FlipType, ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Full-screen photo editor — pan + pinch an image under a fixed crop frame,
// pick an aspect, rotate, flip, then bake the result with
// expo-image-manipulator. The native echo of the web `ImageCropper`
// (zoom / rotate / flip / aspect presets). Cancel discards; Done returns
// the baked { uri, width, height }.
//
// `lockedAspect` forces a single ratio and hides the aspect chips — used by
// the event-flyer (4:5) and place-cover (16:9) wizards, which must produce a
// fixed shape.

type AspectOption = { label: string; value: number | null };
const ASPECTS: AspectOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
];

const MAX_SCALE = 8;

type Props = {
  visible: boolean;
  uri: string;
  sourceWidth: number;
  sourceHeight: number;
  onCancel: () => void;
  onDone: (result: { uri: string; width: number; height: number }) => void;
  /** Force one crop ratio (w/h) and hide the aspect picker. */
  lockedAspect?: number;
};

export function ImageCropModal({
  visible,
  uri,
  sourceWidth,
  sourceHeight,
  onCancel,
  onDone,
  lockedAspect,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // The working image can change when the user rotates (each rotate is baked
  // immediately so the crop maths always sees an upright source).
  const [work, setWork] = useState({
    uri,
    w: sourceWidth || 1,
    h: sourceHeight || 1,
  });
  const [aspectIdx, setAspectIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setWork({ uri, w: sourceWidth || 1, h: sourceHeight || 1 });
      setAspectIdx(0);
    }
  }, [visible, uri, sourceWidth, sourceHeight]);

  // Area available for the frame (screen minus the top/bottom control bars).
  const areaW = screenW - 32;
  const areaH = screenH - insets.top - insets.bottom - 220;

  const aspect = lockedAspect ?? ASPECTS[aspectIdx].value;
  const imgAspect = work.w / work.h;

  // Frame size on screen.
  const { frameW, frameH } = useMemo(() => {
    const a = aspect ?? imgAspect;
    let fw = areaW;
    let fh = fw / a;
    if (fh > areaH) {
      fh = areaH;
      fw = fh * a;
    }
    return { frameW: fw, frameH: fh };
  }, [aspect, imgAspect, areaW, areaH]);

  // Scale that makes the image cover the frame at gesture-scale 1.
  const coverScale = useMemo(
    () => Math.max(frameW / work.w, frameH / work.h),
    [frameW, frameH, work.w, work.h],
  );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [work.uri, aspectIdx, frameW, frameH]);

  const clampWorklet = (
    nx: number,
    nyy: number,
    s: number,
  ): { x: number; y: number } => {
    "worklet";
    const dW = work.w * coverScale * s;
    const dH = work.h * coverScale * s;
    const maxX = Math.max(0, (dW - frameW) / 2);
    const maxY = Math.max(0, (dH - frameH) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nx)),
      y: Math.min(maxY, Math.max(-maxY, nyy)),
    };
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const c = clampWorklet(
        savedTx.value + e.translationX,
        savedTy.value + e.translationY,
        scale.value,
      );
      tx.value = c.x;
      ty.value = c.y;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
      scale.value = s;
      const c = clampWorklet(tx.value, ty.value, s);
      tx.value = c.x;
      ty.value = c.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const c = clampWorklet(tx.value, ty.value, scale.value);
      tx.value = withTiming(c.x, { duration: 120 });
      ty.value = withTiming(c.y, { duration: 120 });
      savedTx.value = c.x;
      savedTy.value = c.y;
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  async function rotate() {
    if (busy) return;
    setBusy(true);
    try {
      hapticLight();
      const ref = await ImageManipulator.manipulate(work.uri)
        .rotate(90)
        .renderAsync();
      const saved = await ref.saveAsync({
        compress: 1,
        format: SaveFormat.JPEG,
      });
      setWork({ uri: saved.uri, w: saved.width, h: saved.height });
    } catch {
      // Leave the image as-is on failure.
    } finally {
      setBusy(false);
    }
  }

  async function flip(direction: FlipType) {
    if (busy) return;
    setBusy(true);
    try {
      hapticLight();
      const ref = await ImageManipulator.manipulate(work.uri)
        .flip(direction)
        .renderAsync();
      const saved = await ref.saveAsync({
        compress: 1,
        format: SaveFormat.JPEG,
      });
      setWork({ uri: saved.uri, w: saved.width, h: saved.height });
    } catch {
      // Leave the image as-is on failure.
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    if (busy) return;
    setBusy(true);
    try {
      const s = scale.value;
      const effective = coverScale * s;
      const dW = work.w * effective;
      const dH = work.h * effective;

      const originXpx = (dW - frameW) / 2 - tx.value;
      const originYpx = (dH - frameH) / 2 - ty.value;

      const cropW = Math.min(work.w, frameW / effective);
      const cropH = Math.min(work.h, frameH / effective);
      const originX = Math.min(
        Math.max(0, originXpx / effective),
        work.w - cropW,
      );
      const originY = Math.min(
        Math.max(0, originYpx / effective),
        work.h - cropH,
      );

      const ref = await ImageManipulator.manipulate(work.uri)
        .crop({
          originX: Math.round(originX),
          originY: Math.round(originY),
          width: Math.round(cropW),
          height: Math.round(cropH),
        })
        .renderAsync();
      const saved = await ref.saveAsync({
        compress: 0.9,
        format: SaveFormat.JPEG,
      });
      onDone({ uri: saved.uri, width: saved.width, height: saved.height });
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  // Displayed image size at gesture-scale 1 (the transform applies scale on
  // top of this).
  const baseW = work.w * coverScale;
  const baseH = work.h * coverScale;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* stage */}
          <View className="flex-1 items-center justify-center">
            <View
              style={{
                width: frameW,
                height: frameH,
                overflow: "hidden",
              }}
            >
              <GestureDetector gesture={gesture}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { alignItems: "center", justifyContent: "center" },
                  ]}
                >
                  <Animated.View style={imageStyle}>
                    <Image
                      source={{ uri: work.uri }}
                      style={{ width: baseW, height: baseH }}
                      contentFit="fill"
                    />
                  </Animated.View>
                </Animated.View>
              </GestureDetector>

              {/* grid overlay */}
              <View
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                className="border border-white/70"
              >
                <View className="flex-1 flex-row">
                  <View className="flex-1 border-r border-white/30" />
                  <View className="flex-1 border-r border-white/30" />
                  <View className="flex-1" />
                </View>
                <View
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                  className="flex-col"
                >
                  <View className="flex-1 border-b border-white/30" />
                  <View className="flex-1 border-b border-white/30" />
                  <View className="flex-1" />
                </View>
              </View>
            </View>
          </View>

          {busy ? (
            <View
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              className="items-center justify-center"
            >
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}

          {/* top bar */}
          <View
            style={{ paddingTop: insets.top + 6 }}
            className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-4"
          >
            <Pressable onPress={onCancel} hitSlop={10} disabled={busy}>
              <AppText className="text-[15px] font-semibold text-white">
                Cancel
              </AppText>
            </Pressable>
            <View className="flex-row items-center gap-5">
              <Pressable
                onPress={rotate}
                hitSlop={10}
                disabled={busy}
                accessibilityLabel="Rotate"
              >
                <Icon name="refresh-outline" size={22} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => flip(FlipType.Horizontal)}
                hitSlop={10}
                disabled={busy}
                accessibilityLabel="Flip horizontally"
              >
                <Icon name="swap-horizontal-outline" size={22} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => flip(FlipType.Vertical)}
                hitSlop={10}
                disabled={busy}
                accessibilityLabel="Flip vertically"
              >
                <Icon name="swap-vertical-outline" size={22} color="#fff" />
              </Pressable>
            </View>
            <Pressable onPress={done} hitSlop={10} disabled={busy}>
              <AppText className="text-[15px] font-bold text-mint">
                Done
              </AppText>
            </Pressable>
          </View>

          {/* aspect chips — hidden when the caller locks the ratio */}
          <View
            style={{ paddingBottom: insets.bottom + 16 }}
            className="absolute bottom-0 left-0 right-0 flex-row justify-center gap-2 px-4"
          >
            {(lockedAspect ? [] : ASPECTS).map((opt, i) => (
              <Pressable
                key={opt.label}
                onPress={() => setAspectIdx(i)}
                disabled={busy}
                className={[
                  "rounded-full border px-3 py-1.5",
                  i === aspectIdx
                    ? "border-mint bg-mint/20"
                    : "border-white/30",
                ].join(" ")}
              >
                <AppText
                  className={[
                    "text-[12px] font-semibold",
                    i === aspectIdx ? "text-mint" : "text-white/80",
                  ].join(" ")}
                >
                  {opt.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
