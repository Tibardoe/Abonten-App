import * as SecureStore from "expo-secure-store";
import { useColorScheme as useNativewindColorScheme } from "nativewind";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type ColorScheme, type ThemeColors, themeColors } from "./tokens";

// Mirrors the web app's ThemeProvider (next-themes, `defaultTheme="system"`,
// `attribute="class"`): the user picks Light / Dark / System on
// /settings/switch-appearance and it's remembered per device. Driving
// NativeWind's colour scheme here is what makes both the `dark:` class
// variants and the `.dark:root` CSS-variable swap in global.css take effect,
// so every token (`bg-background`, `text-foreground`, …) re-resolves.

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "abonten.theme-preference";

type ThemeContextValue = {
  /** What the user chose. */
  preference: ThemePreference;
  /** The concrete scheme in effect right now ("system" resolved against the OS). */
  scheme: ColorScheme;
  /** Concrete `hsl(...)` colour map for `scheme`, for the rare non-className need. */
  colors: ThemeColors;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Restore the saved preference once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (
          !cancelled &&
          (saved === "light" || saved === "dark" || saved === "system")
        ) {
          setPreferenceState(saved);
          setColorScheme(saved);
        }
      } catch {
        // No stored preference / SecureStore unavailable — stay on "system".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setColorScheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      setColorScheme(next);
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
    },
    [setColorScheme],
  );

  const scheme: ColorScheme = colorScheme === "dark" ? "dark" : "light";

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, colors: themeColors(scheme), setPreference }),
    [preference, scheme, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}

/** Shorthand for the concrete colour map (tab bars, chart libs, icon tints). */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}
