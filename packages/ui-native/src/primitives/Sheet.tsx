import { type ReactNode, useEffect, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../theme/ThemeProvider";
import { shadow } from "../theme/tokens";
import { Icon } from "./Icon";
import { SectionTitle } from "./Typography";

// Native echo of apps/web/src/components/atoms/BottomSheet.tsx — the surface
// the web app uses for the filter modal, date pickers, and anchored menus.
// Same prop shape (`open` / `onClose` / `title` / `footer`) so those flows
// port across. Built on RN's Modal so it needs no extra dependency.
//
// Keyboard handling: `adjustResize` does NOT apply to content inside a RN
// <Modal>, and a `KeyboardAvoidingView behavior="padding"` on a flex-end
// container pushes the WHOLE panel up by the keyboard height without
// shrinking it — so a tall sheet (location picker, filters) ends up with
// its header shoved off the top of the screen. Instead we track the
// keyboard height ourselves and (a) lift the panel by exactly that height
// so the footer clears the keyboard, and (b) cap the panel's max-height to
// the space that's left above the keyboard so the title bar and close
// button stay on-screen. The scroll view then scrolls the focused field
// into that visible window. Every bottom sheet renders through here, so
// this behaviour is uniform.

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When set, a back chevron shows left of the title (multi-step sheets). */
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** Cap the sheet height as a fraction of the screen (default 0.85). */
  maxHeightRatio?: number;
  /**
   * Float the sheet up to at least this fraction of the screen even when its
   * content is short — so important sheets (location picker, add wallet,
   * create actions, filters) don't sit buried at the bottom edge. Responsive:
   * it's a ratio of the live window height, never a fixed pixel value.
   */
  minHeightRatio?: number;
};

export function Sheet({
  open,
  onClose,
  title,
  onBack,
  footer,
  children,
  maxHeightRatio = 0.85,
  minHeightRatio,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  // Live keyboard height. `will*` events fire before the animation on iOS
  // (smoother); Android only emits `did*`.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    // Every time the sheet closes, drop the keyboard and reset the tracked
    // height — otherwise a sheet dismissed while its input was focused keeps
    // the last height (the hide event is missed once the listener is torn
    // down), and the NEXT open renders lifted / clipped with dead space at
    // the bottom where the keyboard used to be.
    if (!open) {
      setKbHeight(0);
      Keyboard.dismiss();
      return;
    }
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, [open]);

  // Guard: only ever apply a lift/clamp while the sheet is actually open, so
  // a stale height from a previous session can't affect the next open.
  const kb = open ? kbHeight : 0;

  // Space available for the panel above the keyboard (and below the status
  // bar). The panel is lifted by `kb` so its footer sits just above the
  // keyboard; its max-height is clamped to what's left so the header never
  // runs off the top.
  const available = Math.max(220, height - kb - insets.top - 8);
  const maxHeight = Math.min(height * maxHeightRatio, available);
  const minHeight =
    minHeightRatio != null
      ? Math.min(maxHeight, height * minHeightRatio)
      : undefined;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: c.overlay,
            opacity: 0.6,
          }}
        />
        <View
          className="rounded-t-2xl border-t border-border bg-popover"
          style={[
            { maxHeight, marginBottom: kb },
            minHeight != null ? { minHeight } : null,
            shadow.sheet,
          ]}
        >
          <View className="items-center pb-1 pt-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          {title ? (
            <View className="flex-row items-center gap-2 border-b border-border px-4 pb-3 pt-1">
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={onBack}
                  hitSlop={8}
                >
                  <Icon name="chevron-back" size={22} tone="foreground" />
                </Pressable>
              ) : null}
              <SectionTitle className="flex-1">{title}</SectionTitle>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
              >
                <Icon name="close" size={22} tone="muted" />
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={minHeight != null ? { flexGrow: 1 } : undefined}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 16 + (footer ? 0 : insets.bottom),
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View
              className="border-t border-border px-4 pt-4"
              style={{
                paddingBottom: 16 + (kb > 0 ? 4 : insets.bottom),
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
