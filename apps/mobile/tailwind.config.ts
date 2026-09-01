import { brandColors, radiusScale } from "@abonten/ui-tokens/tailwind";
import type { Config } from "tailwindcss";

// NativeWind (v4) Tailwind config for the mobile app. Semantic colours are
// `hsl(var(--x))` referencing the custom properties in global.css — the same
// approach as apps/web/tailwind.config.ts. Literal brand colours + the
// radius scale come straight from @abonten/ui-tokens so web and native share
// them.

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    // Shared native primitives use the same token classes — Tailwind must
    // scan them so those utilities are generated.
    "../../packages/ui-native/src/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        ...brandColors,
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        overlay: "hsl(var(--overlay))",
      },
      borderRadius: radiusScale,
    },
  },
  plugins: [],
} satisfies Config;
