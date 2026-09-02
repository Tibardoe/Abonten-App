import * as Haptics from "expo-haptics";

// Thin wrapper around expo-haptics. Every call is fire-and-forget and
// swallows errors: the taptic engine is missing on many Android devices and
// on the simulator, and a rejected promise there should never bubble into a
// screen's logic. Import this instead of expo-haptics directly so the
// try/catch isn't repeated at every call site.

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

export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}

export function hapticSelection() {
  Haptics.selectionAsync().catch(() => {});
}
