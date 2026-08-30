// The single source of truth for Abonten's colour palette.
//
// WEB: the shadcn semantic tokens are consumed as `hsl(var(--x))` in
// apps/web/src/app/globals.css; the HSL triples below are the exact values
// that file sets on `:root` and `.dark`. Keep the two in sync — globals.css
// stays the runtime source for the web, this file mirrors it for tooling
// and for the native theme, which cannot use CSS variables.
//
// NATIVE: build a concrete light/dark colour object from `semanticHsl`
// (wrap each triple as `hsl(<triple>)`).

/** Literal brand colours used directly (not via a CSS variable). */
export const brandColors = {
  mint: "#4FD9C4",
  iconGray: "#544F4F",
} as const;

/** `H S% L%` triples, matching globals.css exactly. */
export const semanticHsl = {
  light: {
    background: "220 20% 97%",
    foreground: "220 25% 12%",
    card: "0 0% 100%",
    "card-foreground": "220 25% 12%",
    popover: "0 0% 100%",
    "popover-foreground": "220 25% 12%",
    primary: "171 65% 45%",
    "primary-foreground": "171 40% 12%",
    secondary: "220 16% 93%",
    "secondary-foreground": "220 25% 15%",
    muted: "220 14% 95%",
    "muted-foreground": "220 10% 46%",
    accent: "171 45% 93%",
    "accent-foreground": "171 50% 20%",
    destructive: "0 72% 51%",
    "destructive-foreground": "0 0% 100%",
    success: "152 60% 36%",
    "success-foreground": "0 0% 100%",
    warning: "32 95% 44%",
    "warning-foreground": "32 40% 12%",
    border: "220 14% 88%",
    input: "220 14% 88%",
    ring: "171 65% 45%",
    "chart-1": "12 76% 61%",
    "chart-2": "173 58% 39%",
    "chart-3": "197 37% 24%",
    "chart-4": "43 74% 66%",
    "chart-5": "27 87% 67%",
    sidebar: "0 0% 100%",
    "sidebar-foreground": "220 25% 12%",
    "sidebar-border": "220 14% 88%",
    "sidebar-accent": "171 45% 93%",
    "sidebar-accent-foreground": "171 50% 20%",
    overlay: "220 25% 8%",
  },
  dark: {
    background: "222 18% 9%",
    foreground: "220 15% 92%",
    card: "222 16% 12%",
    "card-foreground": "220 15% 92%",
    popover: "222 16% 15%",
    "popover-foreground": "220 15% 92%",
    primary: "171 60% 52%",
    "primary-foreground": "171 45% 10%",
    secondary: "222 14% 18%",
    "secondary-foreground": "220 15% 90%",
    muted: "222 14% 16%",
    "muted-foreground": "220 10% 62%",
    accent: "171 30% 20%",
    "accent-foreground": "171 55% 78%",
    destructive: "0 62% 42%",
    "destructive-foreground": "0 0% 98%",
    success: "159 60% 52%",
    "success-foreground": "160 40% 10%",
    warning: "43 90% 56%",
    "warning-foreground": "40 40% 10%",
    border: "222 14% 20%",
    input: "222 14% 20%",
    ring: "171 60% 52%",
    "chart-1": "220 70% 50%",
    "chart-2": "160 60% 45%",
    "chart-3": "30 80% 55%",
    "chart-4": "280 65% 60%",
    "chart-5": "340 75% 55%",
    sidebar: "222 20% 7%",
    "sidebar-foreground": "220 15% 88%",
    "sidebar-border": "222 14% 17%",
    "sidebar-accent": "171 30% 18%",
    "sidebar-accent-foreground": "171 55% 78%",
    overlay: "222 30% 3%",
  },
} as const;

export type SemanticColorName = keyof typeof semanticHsl.light;
export type ColorScheme = keyof typeof semanticHsl;

/** Concrete `hsl(...)` values for a scheme — for the native theme. */
export function resolveScheme(
  scheme: ColorScheme,
): Record<SemanticColorName, string> {
  const out = {} as Record<SemanticColorName, string>;
  for (const [name, triple] of Object.entries(semanticHsl[scheme])) {
    out[name as SemanticColorName] = `hsl(${triple})`;
  }
  return out;
}
