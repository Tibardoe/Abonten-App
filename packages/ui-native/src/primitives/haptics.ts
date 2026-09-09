import * as Haptics from "expo-haptics";

// Thin wrapper around expo-haptics. Every call is fire-and-forget and
// swallows errors: the taptic engine is missing on many Android devices and
// on the simulator, and a rejected promise there should never bubble into a
// screen's logic. Import this instead of expo-haptics directly so the
// try/catch isn't repeated at every call site.
//
// Lives in ui-native so the shared primitives (Button, PressableScale,
// Toast, Sheet) can confirm a touch themselves; apps/mobile/src/lib/haptics
// re-exports these, so there is still exactly one implementation.

export function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

export function hapticWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
}

export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}

export function hapticSelection() {
  Haptics.selectionAsync().catch(() => {});
}
