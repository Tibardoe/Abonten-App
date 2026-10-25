import type { MetadataRoute } from "next";

// /manifest.webmanifest: the website's name, icon and colours when someone
// adds it to a home screen. The icons are the app icon's drawing, Small mark
// on Night, made by scripts/gen-brand-assets.mjs; the mark sits inside the
// safe zone, so the same file serves as the maskable icon. Excluded from the
// session proxy (proxy.ts), like robots.txt and sitemap.xml.
//
// "browser", not "standalone": a standalone manifest makes the website
// installable, and Chrome then offers to install it on its own — beside the
// Abonten app, which is the one to install.

const NIGHT = "#121410";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Abonten Hub",
    short_name: "Abonten",
    description:
      "Discover events and places around you, buy tickets and find your next experience on Abonten Hub.",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: NIGHT,
    theme_color: NIGHT,
    lang: "en",
    categories: ["entertainment", "events", "lifestyle"],
    icons: [
      {
        src: "/assets/images/brand/abonten-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/images/brand/abonten-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/images/brand/abonten-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
