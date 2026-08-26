import localFont from "next/font/local";

// Self-hosted via next/font/local instead of a plain CSS @font-face block:
// this gets automatic font-display: swap, preloading, and a generated CSS
// variable, so Tailwind's font-sans utility can reference it directly
// instead of the previously-broken --font-euclidCircular variable that was
// never actually defined anywhere.
export const euclidCircular = localFont({
  src: [
    {
      path: "../../public/fonts/Euclid-Circular-B-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/Euclid-Circular-B-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Euclid-Circular-B-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/Euclid-Circular-B-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/Euclid-Circular-B-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-euclid",
  display: "swap",
});
