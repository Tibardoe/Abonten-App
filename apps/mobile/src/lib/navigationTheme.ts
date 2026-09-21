import { toRgb, useTheme } from "@abonten/ui-native/theme";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useMemo } from "react";

// React Navigation paints its NATIVE surfaces from its own theme, not from
// anything a screen styles: on iOS the native stack's UINavigationController
// view (`nativeContainerStyle` in NativeStackView) and every screen's default
// content background, the bottom-tab container, headers, cards. Without a
// ThemeProvider it uses DefaultTheme, whose background is rgb(242, 242, 242)
// in BOTH app themes — that grey is what an interrupted or reversed iOS
// swipe-back revealed beside the screen (dimmed by UIKit's transition shade,
// so it read as "white" in dark mode and "washed" in light mode). Screens
// can't restyle that container, so the theme is the only fix that covers
// every navigator, present and future.
//
// Colours are passed as rgb(): React Navigation runs theme colours through
// the `color` library, which can't read the tokens' `hsl(H S% L%)` form.
export function useNavigationTheme(): Theme {
  const { scheme, colors } = useTheme();
  return useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: scheme === "dark",
      colors: {
        primary: toRgb(colors.primary),
        background: toRgb(colors.background),
        card: toRgb(colors.card),
        text: toRgb(colors.foreground),
        border: toRgb(colors.border),
        notification: toRgb(colors.destructive),
      },
    };
  }, [scheme, colors]);
}
