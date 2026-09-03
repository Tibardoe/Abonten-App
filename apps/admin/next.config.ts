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

export default nextConfig;
