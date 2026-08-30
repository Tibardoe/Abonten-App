import type { Metadata } from "next";
import "./globals.css";
import { euclidCircular } from "@/app/fonts";
import LocaleProvider from "@/i18n/LocaleProvider";
import { defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import ToastProvider from "@/providers/ToastProvider";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const metadata: Metadata = {
  title: "Abonten Hub | Connecting people to experiences",
  description: "Explore and attend real-time events",
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
                <main>{children}</main>
              </ToastProvider>
            </ReactQueryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
