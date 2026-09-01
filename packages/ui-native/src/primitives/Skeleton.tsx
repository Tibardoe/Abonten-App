import { useEffect, useRef } from "react";
import { Animated, type DimensionValue, Easing, View } from "react-native";

// Native echo of apps/web/src/components/ui/skeleton.tsx and the ~20
// per-component skeletons on web. Screens currently show a bare
// <ActivityIndicator>; use these for list/detail loading instead so the
// loading state has the shape of the content.

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  className?: string;
  style?: object;
};

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  className,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={["bg-muted", className ?? ""].filter(Boolean).join(" ")}
      style={[{ width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

/** N stacked text lines; the last is 60% width like real wrapped text. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <View className={["gap-2", className ?? ""].filter(Boolean).join(" ")}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          key={i}
          height={12}
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </View>
  );
}
