import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Docker (self-hosted) needs the standalone server bundle (see Dockerfile).
  // Vercel sets VERCEL=1 during its builds and doesn't need/want standalone —
  // it does its own packaging, and combining it with Turbopack's build-time
  // tracing has known issues that break Vercel's onBuildComplete step.
  output: process.env.VERCEL ? undefined : "standalone",

  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // ✅ Enable Server Actions
  },

  images: {
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
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
