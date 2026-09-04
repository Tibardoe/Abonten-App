import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",

  // Workspace packages shipped as raw TypeScript — Next/Turbopack compiles
  // them like app code. @abonten/services is server-only (it is never
  // imported from a "use client" module here) and pulls in node built-ins.
  transpilePackages: [
    "@abonten/core",
    "@abonten/types",
    "@abonten/validation",
    "@abonten/services",
    "@abonten/ui-tokens",
  ],

  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },

  // The admin console is internal — never index it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

// Same Sentry build-plugin setup as apps/web, pointed at the
// `abonten-admin` project. The plugin only uploads source maps when
// SENTRY_AUTH_TOKEN is present (set per Vercel project / CI, never
// committed) — a local `next build` succeeds without it, just skipping
// upload. The auth token is an org-level Sentry credential; reuse the same
// value across the web and admin projects.
export default withSentryConfig(nextConfig, {
  org: "abonten-hub",
  project: "abonten-admin",
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
