import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { shadow } from "../theme/tokens";
import { Icon } from "./Icon";
import { SectionTitle } from "./Typography";

// Native echo of apps/web/src/components/atoms/BottomSheet.tsx — the surface
// the web app uses for the filter modal, date pickers, and anchored menus.
// Same prop shape (`open` / `onClose` / `title` / `footer`) so those flows
// port across. Built on RN's Modal so it needs no extra dependency.

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  /** Cap the sheet height as a fraction of the screen (default 0.85). */
  maxHeightRatio?: number;
};

export function Sheet({
  open,
  onClose,
  title,
  footer,
  children,
  maxHeightRatio = 0.85,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const c = useThemeColors();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
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
            <View className="flex-row items-center justify-between border-b border-border px-4 pb-3 pt-1">
              <SectionTitle>{title}</SectionTitle>
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
            contentContainerClassName="p-4"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View className="border-t border-border p-4">{footer}</View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
