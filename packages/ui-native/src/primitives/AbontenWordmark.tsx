import { Text } from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { family } from "../theme/tokens";

// The "Abonten Hub" wordmark, matching the web brand lockup where "Hub" is
// set in the brand accent. Pairs with <AbontenLogo> on the auth screen and
// anywhere the name is shown as a heading rather than nav chrome.

export type AbontenWordmarkProps = {
  /** Font size in px (default 20). */
  size?: number;
};

export function AbontenWordmark({ size = 20 }: AbontenWordmarkProps) {
  const c = useThemeColors();
  const fontFamily = family.byWeight["700"] ?? family.body;
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Abonten Hub"
      style={{
        fontSize: size,
        fontWeight: "700",
        letterSpacing: 0.2,
        fontFamily,
        color: c.foreground,
      }}
    >
      Abonten <Text style={{ color: c.primary, fontFamily }}>Hub</Text>
    </Text>
  );
}
