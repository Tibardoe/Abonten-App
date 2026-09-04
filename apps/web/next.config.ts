import { withSentryConfig } from "@sentry/nextjs/config";
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
  transpilePackages: [
    "@abonten/core",
    "@abonten/types",
    "@abonten/validation",
    "@abonten/i18n",
    "@abonten/ui-tokens",
  ],

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

  // The Apple App Site Association file is extension-less; iOS requires it be
  // served as application/json. (assetlinks.json already gets the right type
  // from its extension.)
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
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

// Sentry wraps the fully-composed config. The bundler plugin only uploads
// source maps when SENTRY_AUTH_TOKEN is present (set in CI / Vercel, never
// committed) — local `next build` succeeds without it, just skipping upload.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "abonten-hub",
  project: "abonten-web",

  // Only chatter about source-map upload when running in CI.
  silent: !process.env.CI,

  // Server-only token for uploading source maps + creating the release.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client maps so minified stack traces resolve.
  widenClientFileUpload: true,

  // Upload maps to Sentry for prod debugging, then delete them from the
  // deployed output so they're never served publicly.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Don't send anonymous usage data to Sentry from the build.
  telemetry: false,
});
