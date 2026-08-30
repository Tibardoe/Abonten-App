import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Docker (self-hosted) needs the standalone server bundle (see Dockerfile).
  // Vercel sets VERCEL=1 during its builds and doesn't need/want standalone —
  // it does its own packaging, and combining it with Turbopack's build-time
  // tracing has known issues that break Vercel's onBuildComplete step.
  output: process.env.VERCEL ? undefined : "standalone",

  // Workspace packages shipped as raw TypeScript source (no build step) —
  // Next/Turbopack must compile them the same as app code.
  transpilePackages: ["@abonten/core", "@abonten/types", "@abonten/validation", "@abonten/i18n"],

  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // ✅ Enable Server Actions
  },

  images: {
    // next/image rejects any `quality` prop value not listed here (Next 16).
    // The app requests quality 90 for hero/cover imagery; 75 is the default.
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**", // Match all paths
      },

      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },

  // /manage/attendance/* was removed — its functionality was fully absorbed
  // into /manage/events (list) and /manage/events/[eventId]?tab=insights
  // (per-event attendance/check-in). These redirects keep old bookmarks and
  // any external links working.
  async redirects() {
    return [
      {
        source: "/manage/attendance/event-list",
        destination: "/manage/events",
        permanent: true,
      },
      {
        source: "/manage/attendance/attendance-list",
        has: [{ type: "query", key: "eventId", value: "(?<eventId>.*)" }],
        destination: "/manage/events/:eventId?tab=insights",
        permanent: true,
      },
      {
        source: "/manage/attendance/attendance-list",
        destination: "/manage/events",
        permanent: true,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
