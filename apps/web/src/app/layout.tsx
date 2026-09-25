import type { Metadata } from "next";
import "./globals.css";
import { euclidCircular } from "@/app/fonts";
import LocaleProvider from "@/i18n/LocaleProvider";
import { defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import ToastProvider from "@/providers/ToastProvider";
import InviteBinder from "@/rewards/atoms/InviteBinder";
import ReferralTouchLogger from "@/rewards/atoms/ReferralTouchLogger";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const metadata: Metadata = {
  // Absolute base for every relative Open Graph / canonical URL the pages
  // declare, so shared links carry a full https URL.
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  // Every page sets a short title; the template appends the brand once.
  title: {
    default: "Abonten Hub | Connecting people to experiences",
    template: "%s | Abonten Hub",
  },
  description:
    "Discover events and places around you, buy tickets and find your next experience on Abonten Hub.",
  icons: {
    icon: "/assets/images/abonten-logo-only-white.svg",
    shortcut: "/assets/images/abonten-logo-only-white.svg",
    apple: "/assets/images/abonten-logo-only-white.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Always render the default locale on the server, instead of reading the
  // locale cookie here — a cookies() read in the root layout would force
  // every page in the app into per-request dynamic rendering, since it
  // wraps everything. LocaleProvider corrects to the visitor's saved
  // locale client-side after hydration (see its own comment for the
  // trade-off this makes).
  const messages = await loadMessages(defaultLocale);

  return (
    <html
      lang={defaultLocale}
      className={`${euclidCircular.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider defaultMessages={messages}>
            <ReactQueryProvider>
              <ToastProvider>
                {children}
                <ReferralTouchLogger />
                <InviteBinder />
              </ToastProvider>
            </ReactQueryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
