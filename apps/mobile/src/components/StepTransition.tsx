import { useReducedMotion } from "@abonten/ui-native";
import { type ReactNode, useRef } from "react";
import { View } from "react-native";
import Animated, { FadeInLeft, FadeInRight } from "react-native-reanimated";

// Wraps the body of a multi-step wizard so moving between steps reads as a
// direction, not a flicker.
//
// The whole form used to swap in place: seven steps of Create Event all
// rendered into the same box, so "Next" looked identical to "the screen
// glitched". A 160ms fade with a 16px slide *in the direction of travel*
// (forward slides in from the right, Back from the left) is enough to say
// which way you just moved, and short enough that a fast tapper never waits
// on it.
//
// Deliberately entry-only: no exit animation, so the next step is already
// interactive on the first frame. Under reduce-motion the wrapper renders a
// plain View and the swap is instant.

export function StepTransition({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const previous = useRef(step);
  const forward = step >= previous.current;
  previous.current = step;

  if (reducedMotion) return <View>{children}</View>;

  return (
    <Animated.View
      // Keyed on the step so React remounts (and therefore re-animates) the
      // body on every move.
      key={step}
      entering={(forward ? FadeInRight : FadeInLeft)
        .duration(160)
        .withInitialValues({ transform: [{ translateX: forward ? 16 : -16 }] })}
    >
      {children}
    </Animated.View>
  );
}
