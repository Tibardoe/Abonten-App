import AppShell from "@/app/AppShell";
import { isLocale, locales } from "@/i18n/config";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// The root layout sits under app/[locale]: the proxy rewrites every page
// address to its language ("/plans" → "/fr/plans" for a French visitor,
// see i18n/routing.ts), so the whole page — <html lang>, titles, every
// string — is rendered in that language on the server, and the static
// pages are prerendered once per language. An address that matches no
// route at all is rendered by app/global-not-found.tsx instead.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Anything that is not one of the six languages is not a page of ours.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: isLocale(locale) ? locale : "en",
    namespace: "metadata",
  });
  const title = t("siteTitle");
  const description = t("siteDescription");
  return {
    // Absolute base for every relative Open Graph / canonical URL the pages
    // declare, so shared links carry a full https URL.
    metadataBase: new URL(PUBLIC_SITE_ORIGIN),
    // Every page sets a short title; the template appends the brand once.
    title: {
      default: title,
      template: t("sAbontenHub"),
    },
    description,
    // The link preview for any page that doesn't bring its own (events,
    // places and Weekly editions do): the brand over the homepage photo.
    openGraph: {
      siteName: "Abonten Hub",
      type: "website",
      title,
      description,
      images: [
        {
          url: "/assets/images/brand/og-default.jpg",
          width: 1200,
          height: 630,
          alt: t("abonten"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/assets/images/brand/og-default.jpg"],
    },
    // favicon.ico holds hand-tuned 16/24/32 px drawings of the mark (plus
    // 48 px); browsers that take SVG use the vector Micro mark instead.
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/assets/images/brand/favicon.svg", type: "image/svg+xml" },
      ],
      apple: "/assets/images/brand/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <AppShell locale={locale}>{children}</AppShell>;
}
