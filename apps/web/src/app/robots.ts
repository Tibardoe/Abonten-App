import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import type { MetadataRoute } from "next";

// Crawlers get the public discovery surface (events, places, city pages,
// Abonten Weekly, help, legal) and are kept out of everything that is
// personal, signed-in or transactional, and out of the links that carry a
// private token (an SOS page, a trusted-contact answer, a Weekly preview).
// Those pages also say noindex themselves. Pages that are shared as links
// but are not search results (a friend's invite, a Story) are not listed:
// link-preview robots read this file too, and they say noindex instead.
// Served at /robots.txt; excluded from the session proxy so it never
// redirects to sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/balance",
          "/checkout/",
          "/consent/",
          "/field/",
          "/finances",
          "/for-you",
          "/identity/",
          "/manage/",
          "/messages/",
          "/plans",
          "/rewards",
          "/safety",
          "/search",
          "/settings",
          "/sos/",
          "/ticket-plans/",
          "/transactions",
          "/trusted/",
          "/unsubscribe/",
          "/user-account",
          "/wallet",
          "/weekly/preview/",
          "/account-restricted",
          "/admin/",
        ],
      },
    ],
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
