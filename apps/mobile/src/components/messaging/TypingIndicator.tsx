import { useReducedMotion } from "@/lib/useReducedMotion";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

// Three dots in a receiver-side bubble. Fades the dots in sequence unless the
// OS reduce-motion setting is on, in which case they sit static.
export function TypingIndicator() {
  const reduceMotion = useReducedMotion();
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.3,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    for (const l of loops) l.start();
    return () => {
      for (const l of loops) l.stop();
    };
  }, [dots, reduceMotion]);

  return (
    <View className="items-start px-3 pt-1">
      <View className="flex-row gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-3">
        {dots.map((d, i) => (
          <Animated.View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-element list
            key={i}
            style={{ opacity: d }}
            className="h-2 w-2 rounded-full bg-muted-foreground"
          />
        ))}
      </View>
    </View>
  );
}
