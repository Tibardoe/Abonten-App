// Moved into @abonten/ui-native (one module-level AccessibilityInfo listener
// shared by every consumer, instead of one per mounted component) so the
// shared primitives can honour the setting too. Re-exported here because
// screens already import it from this path.
export { useReducedMotion } from "@abonten/ui-native";
