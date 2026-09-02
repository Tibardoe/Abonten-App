import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
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

// Full-screen image viewer — a lightweight lightbox for the profile photo
// (ProfileHeader avatar, Edit Profile avatar) and anywhere else a single
// image should open in place rather than navigate. Black ground, the image
// letterboxed with contentFit="contain", tap or the close button to dismiss,
// and a drag (up or down) that tracks the finger and closes past a
// threshold — the familiar Instagram/WhatsApp media gesture.

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 800;

export function ImageViewer({
  uri,
  open,
  onClose,
}: {
  uri: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (open) {
      ty.value = 0;
      opacity.value = 1;
    }
  }, [open, ty, opacity]);

  const pan = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .onUpdate((e) => {
      ty.value = e.translationY;
      opacity.value = Math.max(
        0,
        1 - Math.abs(e.translationY) / (height * 0.6),
      );
    })
    .onEnd((e) => {
      const dismiss =
        Math.abs(e.translationY) > CLOSE_DISTANCE ||
        Math.abs(e.velocityY) > CLOSE_VELOCITY;
      if (dismiss) {
        ty.value = withTiming(
          e.translationY >= 0 ? height : -height,
          { duration: 160 },
          (finished) => {
            if (finished) runOnJS(onClose)();
          },
        );
        opacity.value = withTiming(0, { duration: 160 });
      } else {
        ty.value = withTiming(0);
        opacity.value = withTiming(1);
      }
    });

  const tap = Gesture.Tap().onEnd(() => runOnJS(onClose)());
  const gesture = Gesture.Race(pan, tap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!uri) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#000" },
            bgStyle,
          ]}
        >
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                { flex: 1, alignItems: "center", justifyContent: "center" },
                imageStyle,
              ]}
            >
              <Image
                source={{ uri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                transition={150}
                accessibilityLabel="Full screen image"
              />
            </Animated.View>
          </GestureDetector>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={12}
            style={{
              position: "absolute",
              top: insets.top + 8,
              right: 12,
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" size={28} color="#fff" />
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
