import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
    ],
  },
};

export default nextConfig;
