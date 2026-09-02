import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
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
// The panel is wrapped in a KeyboardAvoidingView so a focused input inside
// the sheet lifts it clear of the keyboard instead of being hidden behind
// it, and its scroll + footer carry the bottom safe-area inset so nothing
// sits under the home indicator. Every bottom sheet in the app renders
// through here, so this behaviour is uniform.

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
};

export function Sheet({
  open,
  onClose,
  title,
  onBack,
  footer,
  children,
  maxHeightRatio = 0.85,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
          style={[{ maxHeight: height * maxHeightRatio }, shadow.sheet]}
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
              style={{ paddingBottom: 16 + insets.bottom }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
