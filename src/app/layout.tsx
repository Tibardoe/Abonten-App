import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/context/authProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

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
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className="antialiased"
      style={{ fontFamily: "EuclidCircular, sans-serif" }}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ReactQueryProvider>
              <Providers>
                <main>{children}</main>
              </Providers>
            </ReactQueryProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
