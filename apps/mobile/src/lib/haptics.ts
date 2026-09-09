// Haptics moved into @abonten/ui-native so the shared primitives (Button,
// PressableScale, Toast) can confirm a touch themselves. This file stays as
// the app-side import path every screen already uses — one implementation,
// two names for it.
export {
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
  hapticError,
  hapticSelection,
} from "@abonten/ui-native";
