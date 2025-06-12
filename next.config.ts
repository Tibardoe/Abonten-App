import type { NextConfig } from "next";
// import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",

  experimental: {
    serverActions: {}, // ✅ Enable Server Actions
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        pathname: "/**", // Match all paths
      },

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

// const withNextIntl = createNextIntlPlugin();

export default nextConfig;
