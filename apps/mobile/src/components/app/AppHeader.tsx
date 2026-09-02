import { useMenuSheet } from "@/components/app/menuSheet";
import {
  AbontenLogo,
  AppText,
  Icon,
  type IoniconName,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The single mobile header for the whole app. One component, four variants,
// so every screen reads as one navigation system instead of N separately
// designed bars.
//
//   branded  — primary/root screens: menu (left) · Abonten mark (centre) ·
//              optional contextual action (right). No back button.
//   title    — secondary/list/settings screens: back (left) · centred title ·
//              optional contextual action (right).
//   detail   — event/place/profile screens: back (left) · optional centred
//              title (right) · contextual actions (right).
//   form     — the create wizards: back (left) · centred title · "Next"
//              (right, in the slot the old bell used).
//
// The centre is its own full-width layer with symmetric horizontal margins,
// so the title / logo sits at the true screen midpoint no matter how wide
// the left and right clusters are (never `justify-content: space-between`).

const HEADER_HEIGHT = 52;
const ICON_SIZE = 24;
const HIT = 40; // touch-target square for every header control
const SIDE_INSET = 4; // outer gap from the screen edge to the first control
const CENTER_MARGIN = 56; // fallback title inset before the side clusters measure

export type AppHeaderVariant = "branded" | "title" | "detail" | "form";

export type AppHeaderProps = {
  variant?: AppHeaderVariant;
  title?: string;
  /** Force-show / hide the back button (defaults: off for "branded", on otherwise). */
  showBack?: boolean;
  /** Override the back action. Defaults to a history-aware pop (see below). */
  onBack?: () => void;
  /** Where back goes when there is no navigation history to pop. */
  backFallback?: string;
  /** Extra control(s) on the left, after the back button (e.g. the profile "+"). */
  leftAccessory?: ReactNode;
  /** Contextual action(s) on the right. Only when the screen genuinely needs one. */
  rightAccessory?: ReactNode;
  /** "form" variant only: renders the Next/Publish button in the right slot. */
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
};

/** 40x40 pressable wrapping a single header icon — one definition for menu / + / gear / share. */
export function HeaderIconButton({
  name,
  onPress,
  accessibilityLabel,
}: {
  name: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={{
        width: HIT,
        height: HIT,
        alignItems: "center",
        justifyContent: "center",
      }}
      className="rounded-full active:opacity-60"
    >
      <Icon name={name} size={ICON_SIZE} tone="foreground" />
    </Pressable>
  );
}

export function AppHeader({
  variant = "title",
  title,
  showBack,
  onBack,
  backFallback = "/(app)",
  leftAccessory,
  rightAccessory,
  onNext,
  nextLabel = "Next",
  nextDisabled,
}: AppHeaderProps) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setOpen } = useMenuSheet();

  // Reserve the same width on both sides of the centred title/logo — the
  // wider of the two clusters — so it sits at the true screen midpoint and
  // never collides with a control, whatever the left/right widths are.
  const [leftW, setLeftW] = useState(0);
  const [rightW, setRightW] = useState(0);
  const centerInset = Math.max(leftW, rightW, CENTER_MARGIN);
  const onLeftLayout = (e: LayoutChangeEvent) =>
    setLeftW(e.nativeEvent.layout.width);
  const onRightLayout = (e: LayoutChangeEvent) =>
    setRightW(e.nativeEvent.layout.width);

  const backVisible = showBack ?? variant !== "branded";

  const handleBack = () => {
    if (onBack) return onBack();
    // router.canGoBack() reads the whole navigation history (parent stack +
    // any nested stack), so it's right whether this screen was pushed onto
    // the (app) stack or sits inside the organizer / settings sub-stack.
    if (router.canGoBack()) router.back();
    else router.replace(backFallback);
  };

  const left = (
    <View
      className="flex-row items-center"
      style={{ marginLeft: SIDE_INSET }}
      onLayout={onLeftLayout}
    >
      {variant === "branded" ? (
        <HeaderIconButton
          name="menu"
          accessibilityLabel="Menu"
          onPress={() => setOpen(true)}
        />
      ) : null}
      {backVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={handleBack}
          style={{
            width: HIT,
            height: HIT,
            alignItems: "center",
            justifyContent: "center",
          }}
          className="rounded-full active:opacity-60"
        >
          <Icon name="arrow-back" size={ICON_SIZE} tone="foreground" />
        </Pressable>
      ) : null}
      {leftAccessory}
    </View>
  );

  const right = (
    <View
      className="flex-row items-center"
      style={{ marginRight: SIDE_INSET }}
      onLayout={onRightLayout}
    >
      {variant === "form" && onNext ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          disabled={nextDisabled}
          hitSlop={8}
          onPress={onNext}
          className="rounded-full px-3 active:opacity-60"
          style={{
            height: HIT,
            justifyContent: "center",
            opacity: nextDisabled ? 0.4 : 1,
          }}
        >
          <AppText className="text-[15px] font-semibold text-primary">
            {nextLabel}
          </AppText>
        </Pressable>
      ) : (
        rightAccessory
      )}
    </View>
  );

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: c.sidebar,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c["sidebar-border"],
      }}
    >
      <View style={{ height: HEADER_HEIGHT, justifyContent: "center" }}>
        {/* Centre layer — full width, symmetric margins => true screen-centre. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: centerInset,
            right: centerInset,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {variant === "branded" ? (
            <AbontenLogo size={34} />
          ) : title ? (
            <AppText
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-[17px] font-semibold text-foreground"
            >
              {title}
            </AppText>
          ) : null}
        </View>

        {/* Side clusters — absolutely pinned so their width never shifts the centre. */}
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="box-none"
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {left}
          </View>
          <View
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {right}
          </View>
        </View>
      </View>
    </View>
  );
}
