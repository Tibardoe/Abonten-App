import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import type { MetadataRoute } from "next";

// Crawlers get the public discovery surface (events, places, Abonten
// Weekly, help, legal) and are kept out of everything that is personal,
// signed-in or transactional. Served at /robots.txt; excluded from the
// session proxy so it never redirects to sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/checkout/",
          "/consent/",
          "/field/",
          "/for-you",
          "/manage/",
          "/messages/",
          "/plans",
          "/rewards",
          "/search",
          "/unsubscribe/",
          "/user-account",
          "/wallet",
          "/account-restricted",
          "/admin/",
        ],
      },
    ],
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
