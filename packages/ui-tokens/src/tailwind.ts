// The literal, framework-neutral slices of the web Tailwind `theme.extend`.
// apps/web/tailwind.config.ts spreads these in; the shadcn semantic colours
// stay there as `hsl(var(--x))` (see palette.ts for their concrete values).

export { brandColors } from "./palette";

export const radiusScale = {
  lg: "var(--radius)",
  md: "calc(var(--radius) - 2px)",
  sm: "calc(var(--radius) - 4px)",
} as const;

export const fontFamily = {
  sans: ["var(--font-euclid)", "sans-serif"],
} as const;

export const backgroundImage = {
  landing: "url('/assets/images/landingpageBackgroound.jpg')",
} as const;

export const keyframes = {
  slideIn: {
    "0%": { transform: "translateX(-100%)" },
    "100%": { transform: "translateX(0)" },
  },
  slideOut: {
    "0%": { transform: "translateX(0)" },
    "100%": { transform: "translateX(-100%)" },
  },
  progressFill: {
    "0%": { width: "0" },
    "100%": { width: "100%" },
  },
} as const;

export const animation = {
  slideIn: "slideIn 0.5s ease-in-out forwards",
  slideOut: "slideOut 0.5s ease-in-out forwards",
  story: "progressFill var(--animation-duration, 3s) linear forwards",
} as const;
